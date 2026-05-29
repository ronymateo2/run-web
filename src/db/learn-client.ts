import { wrap } from "comlink";
import type { SqlValue, BindingSpec } from "@sqlite.org/sqlite-wasm";
import LearnSqliteWorker from "./learn.worker?worker";

interface DbWorkerApi {
  exec(sql: string, bind?: BindingSpec): Promise<void>;
  execBatch(statements: Array<{ sql: string; bind?: BindingSpec }>): Promise<void>;
  query(sql: string, bind?: BindingSpec): Promise<SqlValue[][]>;
  queryObjects(sql: string, bind?: BindingSpec): Promise<Record<string, SqlValue>[]>;
  close(): Promise<void>;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  content TEXT,
  notion_url TEXT,
  tags TEXT,
  published_at TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS _meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const DB_LOCK_NAME = "rurana.learn.opfs";
const RPC_CHANNEL = "rurana.learn.rpc";

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
}

async function becomeLeader(): Promise<void> {
  const worker = new LearnSqliteWorker();
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

async function teardownLeader(): Promise<void> {
  await leaderProxy?.close().catch(console.warn);
  workerInstance?.terminate();
  workerInstance = null;
  leaderProxy = null;
}

async function holdLeadershipUntilReleased(): Promise<void> {
  await new Promise<void>((resolve) => { releaseLeadership = resolve; });
  releaseLeadership = null;
  await teardownLeader();
}

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
      console.warn("[learn-db] leadership takeover failed", error);
    });
}

async function elect(): Promise<void> {
  channel = new BroadcastChannel(RPC_CHANNEL);
  channel.onmessage = handleChannelMessage;

  if (typeof navigator === "undefined" || !navigator.locks) {
    await becomeLeader();
    return;
  }

  let resolveDecided!: (becameLeader: boolean) => void;
  let rejectDecided!: (error: unknown) => void;
  const decided = new Promise<boolean>((resolve, reject) => {
    resolveDecided = resolve;
    rejectDecided = reject;
  });

  void navigator.locks.request(DB_LOCK_NAME, { ifAvailable: true }, async (lock) => {
    if (!lock) {
      resolveDecided(false);
      return;
    }
    try {
      await becomeLeaderWithRetry();
    } catch (error) {
      rejectDecided(error);
      return;
    }
    resolveDecided(true);
    await holdLeadershipUntilReleased();
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
    if (role !== "leader" || !leaderProxy) return;
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
      if (pendingRpc.delete(id)) reject(new Error(`Learn DB RPC timeout: ${method}`));
    }, 15000);
  });
}

async function dispatch(method: RpcMethod, args: unknown[]): Promise<unknown> {
  await ensureInit();
  if (role === "leader" && leaderProxy) {
    const fn = leaderProxy[method] as (...a: unknown[]) => Promise<unknown>;
    return fn.apply(leaderProxy, args);
  }
  return rpcCall(method, args);
}

export async function closeLearnDatabaseWorker(): Promise<void> {
  leadershipAbort?.abort();
  leadershipAbort = null;
  if (role === "leader") releaseLeadership?.();
  channel?.close();
  channel = null;
  roleReady = null;
  role = "pending";
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => { void closeLearnDatabaseWorker(); });
  if (import.meta.hot) {
    import.meta.hot.dispose(() => { void closeLearnDatabaseWorker(); });
  }
}

export async function learnExec(sql: string, bind?: unknown[]): Promise<void> {
  await dispatch("exec", [sql, bind as BindingSpec | undefined]);
}

export async function learnExecBatch(
  statements: Array<{ sql: string; bind?: unknown[] }>
): Promise<void> {
  await dispatch("execBatch", [
    statements.map((s) => ({ sql: s.sql, bind: s.bind as BindingSpec | undefined })),
  ]);
}

export async function learnQueryAll<T>(sql: string, bind?: unknown[]): Promise<T[]> {
  return dispatch("queryObjects", [sql, bind as BindingSpec | undefined]) as Promise<T[]>;
}

export async function learnQueryOne<T>(sql: string, bind?: unknown[]): Promise<T | null> {
  const rows = await learnQueryAll<T>(sql, bind);
  return rows[0] ?? null;
}
