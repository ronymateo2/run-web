import { releaseProxy, wrap } from "comlink";
import type { SqlValue, BindingSpec } from "@sqlite.org/sqlite-wasm";
import DedicatedSqliteWorker from "./sqlite.worker?worker";
import SharedSqliteWorker from "./sqlite.worker?sharedworker";

interface DbWorkerApi {
  exec(sql: string, bind?: BindingSpec): Promise<void>;
  execBatch(statements: Array<{ sql: string; bind?: BindingSpec }>): Promise<void>;
  query(sql: string, bind?: BindingSpec): Promise<SqlValue[][]>;
  queryObjects(sql: string, bind?: BindingSpec): Promise<Record<string, SqlValue>[]>;
  close(): Promise<void>;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT, avatar_url TEXT,
  jwt TEXT, timezone TEXT, last_sync INTEGER DEFAULT 0, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS user_auth_providers (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL,
  provider_sub TEXT NOT NULL, UNIQUE(provider, provider_sub)
);
CREATE TABLE IF NOT EXISTS injuries (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
  zone TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
  current_phase_id TEXT, focus_days TEXT, started_at INTEGER, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS phases (
  id TEXT PRIMARY KEY, injury_id TEXT NOT NULL, phase_num INTEGER NOT NULL,
  name TEXT NOT NULL, description TEXT, week_start INTEGER NOT NULL,
  week_end INTEGER NOT NULL, threshold_pct INTEGER NOT NULL DEFAULT 70, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS phase_criteria (
  id TEXT PRIMARY KEY, phase_id TEXT NOT NULL, description TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, synced INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY, phase_id TEXT NOT NULL, name TEXT NOT NULL,
  detail TEXT, sets INTEGER, reps INTEGER, duration_s INTEGER,
  exercise_type TEXT NOT NULL, sort_order INTEGER DEFAULT 0, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pain_checkins (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, injury_id TEXT, date TEXT NOT NULL,
  zones TEXT NOT NULL, created_at INTEGER, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS exercise_logs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, exercise_id TEXT NOT NULL,
  session_date TEXT NOT NULL, reps_done INTEGER, pain_during INTEGER, rpe INTEGER,
  note TEXT, completed_at INTEGER, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sst_results (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, injury_id TEXT NOT NULL,
  date TEXT NOT NULL, strength_score REAL, pain_score INTEGER, note TEXT, synced INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pain_checkins_user_date ON pain_checkins(user_id, date);
CREATE INDEX IF NOT EXISTS idx_exercise_logs_user_date ON exercise_logs(user_id, session_date);
CREATE INDEX IF NOT EXISTS idx_sst_results_user_date ON sst_results(user_id, date);
`;

const MIGRATIONS: Array<{ id: number; sql: string }> = [
  { id: 1, sql: `ALTER TABLE users ADD COLUMN timezone TEXT` },
  { id: 2, sql: `ALTER TABLE phase_criteria ADD COLUMN synced INTEGER NOT NULL DEFAULT 1` },
];

const DB_LOCK_NAME = "rurana.sqlite.opfs";

let proxyPromise: Promise<DbWorkerApi> | null = null;
let workerInstance: Worker | null = null;
let sharedWorkerInstance: SharedWorker | null = null;
let sharedWorkerPort: MessagePort | null = null;
let releaseDbLock: (() => void) | null = null;
let lockAbortController: AbortController | null = null;

async function initSchema(proxy: DbWorkerApi): Promise<void> {
  await proxy.exec(SCHEMA_SQL);
  await proxy.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`
  );
  const applied = await proxy.queryObjects(`SELECT id FROM _migrations`) as { id: number }[];
  const appliedIds = new Set(applied.map((r) => r.id));
  for (const migration of MIGRATIONS) {
    if (!appliedIds.has(migration.id)) {
      try {
        await proxy.exec(migration.sql);
      } catch (error) {
        // Schema already in desired state (applied before migration tracking existed).
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes("duplicate column name") && !msg.includes("already exists")) {
          throw error;
        }
      }
      await proxy.exec(`INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`, [
        migration.id,
        Date.now(),
      ] as BindingSpec);
    }
  }
}

async function initSharedWorker(): Promise<DbWorkerApi> {
  sharedWorkerInstance = new SharedSqliteWorker();
  sharedWorkerPort = sharedWorkerInstance.port;
  sharedWorkerPort.start();
  const proxy = wrap<DbWorkerApi>(sharedWorkerPort);
  await initSchema(proxy);
  return proxy;
}

async function initDedicatedWorker(): Promise<DbWorkerApi> {
  workerInstance = new DedicatedSqliteWorker();
  const proxy = wrap<DbWorkerApi>(workerInstance);
  await initSchema(proxy);
  return proxy;
}

function initDedicatedWorkerWithLock(): Promise<DbWorkerApi> {
  if (typeof navigator === "undefined" || !navigator.locks) {
    return initDedicatedWorker();
  }

  lockAbortController = new AbortController();

  let releaseLock!: () => void;
  const lockReleased = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  let resolveProxy!: (proxy: DbWorkerApi) => void;
  let rejectProxy!: (error: unknown) => void;
  const proxyReady = new Promise<DbWorkerApi>((resolve, reject) => {
    resolveProxy = resolve;
    rejectProxy = reject;
  });

  void navigator.locks.request(
    DB_LOCK_NAME,
    { mode: "exclusive", signal: lockAbortController.signal },
    async () => {
      releaseDbLock = releaseLock;
      try {
        const proxy = await initDedicatedWorker();
        resolveProxy(proxy);
        await lockReleased;
        await proxy.close().catch(console.warn);
      } catch (error) {
        rejectProxy(error);
      } finally {
        workerInstance?.terminate();
        workerInstance = null;
        releaseDbLock = null;
        lockAbortController = null;
      }
    }
  ).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === "AbortError") return;
    rejectProxy(error);
  });

  return proxyReady;
}

function initWorker(): Promise<DbWorkerApi> {
  if (typeof SharedWorker !== "undefined") {
    return initSharedWorker();
  }
  return initDedicatedWorkerWithLock();
}

function getProxy(): Promise<DbWorkerApi> {
  if (!proxyPromise) {
    const pendingProxy = initWorker().catch((error: unknown) => {
      proxyPromise = null;
      throw error;
    });
    proxyPromise = pendingProxy;
  }
  return proxyPromise;
}

export async function closeDatabaseWorker(): Promise<void> {
  const proxyPromiseToClose = proxyPromise;
  const lockWillCloseWorker = Boolean(releaseDbLock);
  releaseDbLock?.();
  lockAbortController?.abort();
  const proxy = proxyPromiseToClose ? await proxyPromiseToClose.catch(() => null) : null;
  if (sharedWorkerPort) {
    (proxy as (DbWorkerApi & { [releaseProxy]?: () => void }) | null)?.[releaseProxy]?.();
    sharedWorkerPort.close();
    sharedWorkerPort = null;
    sharedWorkerInstance = null;
  } else if (!lockWillCloseWorker) {
    await proxy?.close().catch(console.warn);
    workerInstance?.terminate();
    workerInstance = null;
  }
  proxyPromise = null;
}

if (typeof window !== "undefined") {
  const closeOnPageHide = () => {
    void closeDatabaseWorker();
  };

  window.addEventListener("pagehide", closeOnPageHide);

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      window.removeEventListener("pagehide", closeOnPageHide);
      void closeDatabaseWorker();
    });
  }
}

export async function exec(sql: string, bind?: unknown[]): Promise<void> {
  const proxy = await getProxy();
  await proxy.exec(sql, bind as BindingSpec | undefined);
}

export async function execBatch(
  statements: Array<{ sql: string; bind?: unknown[] }>
): Promise<void> {
  const proxy = await getProxy();
  await proxy.execBatch(
    statements.map((s) => ({ sql: s.sql, bind: s.bind as BindingSpec | undefined }))
  );
}

export async function queryAll<T>(sql: string, bind?: unknown[]): Promise<T[]> {
  const proxy = await getProxy();
  return proxy.queryObjects(sql, bind as BindingSpec | undefined) as Promise<T[]>;
}

export async function queryAllArray(sql: string, bind?: unknown[]): Promise<unknown[][]> {
  const proxy = await getProxy();
  return proxy.query(sql, bind as BindingSpec | undefined);
}

export async function queryOne<T>(sql: string, bind?: unknown[]): Promise<T | null> {
  const rows = await queryAll<T>(sql, bind);
  return rows[0] ?? null;
}
