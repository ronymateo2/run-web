import { wrap } from "comlink";
import type { SqlValue, BindingSpec } from "@sqlite.org/sqlite-wasm";
import DedicatedSqliteWorker from "./sqlite.worker?worker";

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
  exercise_type TEXT NOT NULL, sort_order INTEGER DEFAULT 0, video_url TEXT, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pain_checkins (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, injury_id TEXT, date TEXT NOT NULL,
  zones TEXT NOT NULL, created_at INTEGER, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS exercise_logs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, exercise_id TEXT NOT NULL,
  session_date TEXT NOT NULL, reps_done INTEGER, pain_during INTEGER, rpe INTEGER,
  note TEXT, completed_at INTEGER, deleted_at INTEGER, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sst_results (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, injury_id TEXT NOT NULL,
  date TEXT NOT NULL, strength_score REAL, pain_score INTEGER, note TEXT, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS log_day_counts (
  user_id TEXT NOT NULL, exercise_id TEXT NOT NULL, session_date TEXT NOT NULL,
  sets INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, exercise_id, session_date)
);
CREATE TABLE IF NOT EXISTS prom_instruments (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, zones TEXT NOT NULL, questions TEXT NOT NULL,
  max_per_item INTEGER NOT NULL, invert INTEGER NOT NULL DEFAULT 0,
  better_is_higher INTEGER NOT NULL DEFAULT 0, every_days INTEGER NOT NULL DEFAULT 14, sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS prom_results (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, injury_id TEXT NOT NULL, instrument_id TEXT NOT NULL,
  date TEXT NOT NULL, score REAL, answers TEXT, note TEXT, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY, entity TEXT NOT NULL, entity_id TEXT NOT NULL,
  operation TEXT NOT NULL, payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_log_day_counts_user ON log_day_counts(user_id, exercise_id);
CREATE INDEX IF NOT EXISTS idx_prom_results_user_date ON prom_results(user_id, date);
CREATE INDEX IF NOT EXISTS idx_pain_checkins_user_date ON pain_checkins(user_id, date);
CREATE INDEX IF NOT EXISTS idx_exercise_logs_user_date ON exercise_logs(user_id, session_date);
CREATE INDEX IF NOT EXISTS idx_sst_results_user_date ON sst_results(user_id, date);
CREATE INDEX IF NOT EXISTS idx_injuries_user ON injuries(user_id);
CREATE INDEX IF NOT EXISTS idx_phases_injury ON phases(injury_id);
CREATE INDEX IF NOT EXISTS idx_exercises_phase ON exercises(phase_id);
CREATE INDEX IF NOT EXISTS idx_phase_criteria_phase ON phase_criteria(phase_id);
`;

const MIGRATIONS: Array<{ id: number; sql: string }> = [
  { id: 1, sql: `ALTER TABLE users ADD COLUMN timezone TEXT` },
  { id: 2, sql: `ALTER TABLE phase_criteria ADD COLUMN synced INTEGER NOT NULL DEFAULT 1` },
  { id: 3, sql: `ALTER TABLE exercise_logs ADD COLUMN deleted_at INTEGER` },
  { id: 4, sql: `ALTER TABLE phases ADD COLUMN deleted_at INTEGER` },
  { id: 5, sql: `ALTER TABLE phase_criteria ADD COLUMN deleted_at INTEGER` },
  { id: 6, sql: `ALTER TABLE exercises ADD COLUMN video_url TEXT` },
  { id: 7, sql: `ALTER TABLE phases ADD COLUMN focus_days TEXT` },
  // Backfill the rollup from existing raw logs (runs once). The server only ships
  // day-groups changed since last_sync, so without this an existing install would
  // read zero progress until a forced resync. New installs no-op (empty source).
  {
    id: 8,
    sql: `INSERT OR IGNORE INTO log_day_counts (user_id, exercise_id, session_date, sets)
          SELECT user_id, exercise_id, session_date, COUNT(*)
          FROM exercise_logs WHERE deleted_at IS NULL
          GROUP BY user_id, exercise_id, session_date`,
  },
  // pain_checkins moved from the legacy synced=0 push path to sync_queue. Move any
  // still-unsynced rows into the queue and mark them synced=1, otherwise they'd be
  // stranded forever (the legacy push no longer scans this table).
  {
    id: 9,
    sql: `INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
          SELECT lower(hex(randomblob(16))), 'checkin', id, 'upsert',
                 json_object('id', id, 'user_id', user_id, 'injury_id', injury_id,
                             'date', date, 'zones', zones, 'created_at', created_at),
                 'pending', 0, strftime('%s','now')*1000, strftime('%s','now')*1000
          FROM pain_checkins WHERE synced = 0;
          UPDATE pain_checkins SET synced = 1 WHERE synced = 0;`,
  },
  // Remaining entities moved to sync_queue (same rationale as id 9): backfill every
  // still-unsynced row into the queue, then retire the synced=0 flag for pushes.
  // phase_criteria rides BOTH channels (row content + criteria_done) because a
  // synced=0 row could mean either kind of pending change — exactly what the old
  // legacy push sent. `done` must serialize as JSON boolean (server zod requires it).
  {
    id: 10,
    sql: `
INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
SELECT lower(hex(randomblob(16))), 'exercise_log', id, 'upsert',
       json_object('id', id, 'user_id', user_id, 'exercise_id', exercise_id, 'session_date', session_date,
                   'reps_done', reps_done, 'pain_during', pain_during, 'rpe', rpe, 'note', note,
                   'completed_at', completed_at, 'deleted_at', deleted_at),
       'pending', 0, strftime('%s','now')*1000, strftime('%s','now')*1000
FROM exercise_logs WHERE synced = 0;
UPDATE exercise_logs SET synced = 1 WHERE synced = 0;

INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
SELECT lower(hex(randomblob(16))), 'sst', id, 'upsert',
       json_object('id', id, 'user_id', user_id, 'injury_id', injury_id, 'date', date,
                   'strength_score', strength_score, 'pain_score', pain_score, 'note', note),
       'pending', 0, strftime('%s','now')*1000, strftime('%s','now')*1000
FROM sst_results WHERE synced = 0;
UPDATE sst_results SET synced = 1 WHERE synced = 0;

INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
SELECT lower(hex(randomblob(16))), 'prom', id, 'upsert',
       json_object('id', id, 'user_id', user_id, 'injury_id', injury_id, 'instrument_id', instrument_id,
                   'date', date, 'score', score, 'answers', answers, 'note', note),
       'pending', 0, strftime('%s','now')*1000, strftime('%s','now')*1000
FROM prom_results WHERE synced = 0;
UPDATE prom_results SET synced = 1 WHERE synced = 0;

INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
SELECT lower(hex(randomblob(16))), 'injury', id, 'upsert',
       json_object('id', id, 'current_phase_id', current_phase_id, 'focus_days', focus_days),
       'pending', 0, strftime('%s','now')*1000, strftime('%s','now')*1000
FROM injuries WHERE synced = 0;
UPDATE injuries SET synced = 1 WHERE synced = 0;

INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
SELECT lower(hex(randomblob(16))), 'phase', id, 'upsert',
       json_object('id', id, 'injury_id', injury_id, 'phase_num', phase_num, 'name', name,
                   'description', description, 'week_start', week_start, 'week_end', week_end,
                   'threshold_pct', threshold_pct, 'focus_days', focus_days, 'deleted_at', deleted_at),
       'pending', 0, strftime('%s','now')*1000, strftime('%s','now')*1000
FROM phases WHERE synced = 0;
UPDATE phases SET synced = 1 WHERE synced = 0;

INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
SELECT lower(hex(randomblob(16))), 'exercise', id, 'upsert',
       json_object('id', id, 'phase_id', phase_id, 'name', name, 'detail', detail, 'sets', sets,
                   'reps', reps, 'duration_s', duration_s, 'exercise_type', exercise_type,
                   'sort_order', sort_order, 'video_url', video_url),
       'pending', 0, strftime('%s','now')*1000, strftime('%s','now')*1000
FROM exercises WHERE synced = 0;
UPDATE exercises SET synced = 1 WHERE synced = 0;

INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
SELECT lower(hex(randomblob(16))), 'phase_criterion', id, 'upsert',
       json_object('id', id, 'phase_id', phase_id, 'description', description, 'deleted_at', deleted_at),
       'pending', 0, strftime('%s','now')*1000, strftime('%s','now')*1000
FROM phase_criteria WHERE synced = 0;
INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
SELECT lower(hex(randomblob(16))), 'criteria_done', id, 'upsert',
       json_object('criteria_id', id, 'done', json(CASE WHEN done THEN 'true' ELSE 'false' END)),
       'pending', 0, strftime('%s','now')*1000, strftime('%s','now')*1000
FROM phase_criteria WHERE synced = 0;
UPDATE phase_criteria SET synced = 1 WHERE synced = 0;`,
  },
];

// OPFS SAHPool allows only ONE connection at a time, so we can't open the DB worker in every tab.
// Instead one tab is elected "leader" (it holds an exclusive Web Lock and owns the dedicated
// worker); every other tab is a "follower" that forwards DB calls to the leader over a
// BroadcastChannel and awaits the reply. When the leader tab closes it releases the lock — flushing
// OPFS — and a waiting follower takes over leadership.
const DB_LOCK_NAME = "rurana.sqlite.opfs";
const RPC_CHANNEL = "rurana.sqlite.rpc";

type RpcMethod = "exec" | "execBatch" | "query" | "queryObjects";
type RpcRequest = { kind: "req"; id: string; method: RpcMethod; args: unknown[] };
type RpcResponse = { kind: "res"; id: string; ok: boolean; result?: unknown; error?: string };
type RpcReady = { kind: "ready" };

let role: "pending" | "leader" | "follower" = "pending";
let leaderProxy: DbWorkerApi | null = null;
let workerInstance: Worker | null = null;
let channel: BroadcastChannel | null = null;
let roleReady: Promise<void> | null = null;
let releaseLeadership: (() => void) | null = null;
let leadershipAbort: AbortController | null = null;
const pendingRpc = new Map<
  string,
  { resolve: (v: unknown) => void; reject: (e: unknown) => void; req: RpcRequest }
>();

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

// Spin up the dedicated worker and become the connection owner for this origin.
async function becomeLeader(): Promise<void> {
  const worker = new DedicatedSqliteWorker();
  const proxy = wrap<DbWorkerApi>(worker);
  try {
    await initSchema(proxy);
  } catch (error) {
    // OPFS SAHPool init failed (e.g. previous leader's access handle not yet released).
    // Drop this worker so the retry opens a fresh one.
    worker.terminate();
    throw error;
  }
  workerInstance = worker;
  leaderProxy = proxy;
  role = "leader";
  // Run any RPCs this tab queued while it was still a follower (self-promotion case).
  for (const [id, pending] of pendingRpc) {
    pendingRpc.delete(id);
    const fn = proxy[pending.req.method] as (...a: unknown[]) => Promise<unknown>;
    fn.apply(proxy, pending.req.args).then(pending.resolve, pending.reject);
  }
  // Tell followers a leader is up so they can resend requests dropped during the gap.
  channel?.postMessage({ kind: "ready" } satisfies RpcReady);
}

// Keep retrying promotion while we hold the exclusive lock: the OPFS access handle from a tab that
// just reloaded can take a moment to free, and the new leader MUST eventually win or nobody serves.
async function becomeLeaderWithRetry(signal?: AbortSignal): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    try {
      await becomeLeader();
      return;
    } catch (error) {
      if (attempt >= 50) throw error; // ~5s of 100ms retries before giving up
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

// Tear down the worker (flushes OPFS via db.close() + pauseVfs in the worker).
async function teardownLeader(): Promise<void> {
  await leaderProxy?.close().catch(console.warn);
  workerInstance?.terminate();
  workerInstance = null;
  leaderProxy = null;
}

// Hold the exclusive lock until released (on pagehide / takeover), then tear down the worker.
async function holdLeadershipUntilReleased(): Promise<void> {
  await new Promise<void>((resolve) => { releaseLeadership = resolve; });
  releaseLeadership = null;
  await teardownLeader();
}

// Followers wait in the lock queue; when the current leader releases, the first waiter wins the
// lock here and promotes itself to leader.
function queueLeadershipTakeover(): void {
  leadershipAbort = new AbortController();
  const signal = leadershipAbort.signal;
  void navigator.locks
    .request(DB_LOCK_NAME, { mode: "exclusive", signal }, async () => {
      await becomeLeaderWithRetry(signal);
      await holdLeadershipUntilReleased();
    })
    .catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.warn("[db] leadership takeover failed", error);
    });
}

async function elect(): Promise<void> {
  channel = new BroadcastChannel(RPC_CHANNEL);
  channel.onmessage = handleChannelMessage;

  if (typeof navigator === "undefined" || !navigator.locks) {
    await becomeLeader();
    return;
  }

  // Try to grab leadership immediately; if the lock is busy another tab is already the leader.
  // The lock is only held while the request callback's promise is pending, so the callback must
  // keep awaiting holdLeadershipUntilReleased() — we signal the outcome via `decided` separately.
  let resolveDecided!: (becameLeader: boolean) => void;
  let rejectDecided!: (error: unknown) => void;
  const decided = new Promise<boolean>((resolve, reject) => {
    resolveDecided = resolve;
    rejectDecided = reject;
  });

  void navigator.locks.request(DB_LOCK_NAME, { ifAvailable: true }, async (lock) => {
    if (!lock) {
      resolveDecided(false); // busy → another tab leads; release immediately (return)
      return;
    }
    try {
      await becomeLeaderWithRetry();
    } catch (error) {
      rejectDecided(error);
      return;
    }
    resolveDecided(true);
    await holdLeadershipUntilReleased(); // keep the lock held for as long as we lead
  });

  if (!(await decided)) {
    role = "follower";
    queueLeadershipTakeover();
  }
}

function ensureInit(): Promise<void> {
  if (!roleReady) {
    roleReady = elect().catch((error: unknown) => {
      roleReady = null;
      throw error;
    });
  }
  return roleReady;
}

// Leader executes the request against the worker and replies; followers resolve their pending RPCs.
async function handleChannelMessage(event: MessageEvent): Promise<void> {
  const msg = event.data as RpcRequest | RpcResponse | RpcReady;
  if (msg.kind === "ready") {
    // A new leader came up — resend in-flight requests that may have been dropped during the gap.
    for (const { req } of pendingRpc.values()) channel?.postMessage(req);
    return;
  }
  if (msg.kind === "res") {
    const pending = pendingRpc.get(msg.id);
    if (!pending) return;
    pendingRpc.delete(msg.id);
    if (msg.ok) pending.resolve(msg.result);
    else pending.reject(new Error(msg.error ?? "DB RPC error"));
    return;
  }
  if (msg.kind === "req") {
    if (role !== "leader" || !leaderProxy) return; // only the leader serves requests
    const fn = leaderProxy[msg.method] as (...a: unknown[]) => Promise<unknown>;
    let res: RpcResponse;
    try {
      const result = await fn.apply(leaderProxy, msg.args);
      res = { kind: "res", id: msg.id, ok: true, result };
    } catch (error) {
      res = { kind: "res", id: msg.id, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    channel?.postMessage(res);
  }
}

function rpcCall(method: RpcMethod, args: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const req: RpcRequest = { kind: "req", id, method, args };
    pendingRpc.set(id, { resolve, reject, req });
    channel?.postMessage(req);
    setTimeout(() => {
      if (pendingRpc.delete(id)) reject(new Error(`DB RPC timeout: ${method}`));
    }, 15000);
  });
}

// Route a DB call: leader runs it directly on the worker; followers forward it to the leader.
async function dispatch(method: RpcMethod, args: unknown[]): Promise<unknown> {
  await ensureInit();
  if (role === "leader" && leaderProxy) {
    const fn = leaderProxy[method] as (...a: unknown[]) => Promise<unknown>;
    return fn.apply(leaderProxy, args);
  }
  return rpcCall(method, args);
}

export async function closeDatabaseWorker(): Promise<void> {
  leadershipAbort?.abort();
  leadershipAbort = null;
  if (role === "leader") releaseLeadership?.();
  channel?.close();
  channel = null;
  roleReady = null;
  role = "pending";
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
  await dispatch("exec", [sql, bind as BindingSpec | undefined]);
}

export async function execBatch(
  statements: Array<{ sql: string; bind?: unknown[] }>
): Promise<void> {
  await dispatch("execBatch", [
    statements.map((s) => ({ sql: s.sql, bind: s.bind as BindingSpec | undefined })),
  ]);
}

export async function queryAll<T>(sql: string, bind?: unknown[]): Promise<T[]> {
  return dispatch("queryObjects", [sql, bind as BindingSpec | undefined]) as Promise<T[]>;
}

export async function queryAllArray(sql: string, bind?: unknown[]): Promise<unknown[][]> {
  return dispatch("query", [sql, bind as BindingSpec | undefined]) as Promise<unknown[][]>;
}

export async function queryOne<T>(sql: string, bind?: unknown[]): Promise<T | null> {
  const rows = await queryAll<T>(sql, bind);
  return rows[0] ?? null;
}

// DevTools console access. On in dev; in prod set localStorage.__db_debug="1" then reload.
// Usage: await db.queryAll("SELECT * FROM injuries")
if (typeof window !== "undefined") {
  if (import.meta.env.DEV || localStorage.getItem("__db_debug") === "1") {
    (window as unknown as Record<string, unknown>).db = {
      exec,
      execBatch,
      queryAll,
      queryAllArray,
      queryOne,
    };
  }
}
