// Shared tab-side machinery for an OPFS SQLite database: leader election + RPC.
//
// OPFS SAHPool allows only ONE connection per pool, so we can't open the DB worker
// in every tab. One tab is elected "leader" (it holds an exclusive Web Lock and owns
// the dedicated worker); every other tab is a "follower" that forwards DB calls to
// the leader over a BroadcastChannel and awaits the reply. When the leader tab closes
// it releases the lock — flushing OPFS — and a waiting follower takes over leadership.
//
// navigator.locks usage notes (each one fixed a real hang):
// - The initial probe uses { ifAvailable: true } and the request promise carries a
//   .catch: in a not-fully-active document (Chrome prerender, bfcache edge) request()
//   can reject without ever invoking the callback — unhandled, the election promise
//   would never settle and every DB call would hang the app forever.
// - A failed takeover RE-QUEUES itself: giving up would leave every remaining tab
//   leaderless, turning each DB call into a silent RPC timeout.
// - The lock is held by keeping the request callback's promise pending
//   (holdLeadershipUntilReleased), per spec.
import { wrap } from "comlink";
import type { SqlValue, BindingSpec } from "@sqlite.org/sqlite-wasm";
import type { SqliteWorkerApi } from "./sqlite-worker-core";

export type DbWorkerApi = SqliteWorkerApi;

export interface SqliteClientOptions {
  createWorker: () => Worker;
  lockName: string;
  channelName: string;
  label: string; // log prefix
  // Runs once per leader promotion against the fresh worker (schema + migrations).
  initSchema: (proxy: DbWorkerApi) => Promise<void>;
}

export interface SqliteClient {
  exec(sql: string, bind?: unknown[]): Promise<void>;
  execBatch(statements: Array<{ sql: string; bind?: unknown[] }>): Promise<void>;
  queryAll<T>(sql: string, bind?: unknown[]): Promise<T[]>;
  queryAllArray(sql: string, bind?: unknown[]): Promise<unknown[][]>;
  queryOne<T>(sql: string, bind?: unknown[]): Promise<T | null>;
  isPersistent(): Promise<boolean>;
  // Releases leadership / aborts the takeover and closes the channel. The next DB
  // call re-elects. Also unhooks the pagehide listener (for HMR dispose).
  dispose(): Promise<void>;
}

type RpcMethod = "exec" | "execBatch" | "query" | "queryObjects" | "isPersistent";
type RpcRequest = { kind: "req"; id: string; method: RpcMethod; args: unknown[] };
type RpcResponse = { kind: "res"; id: string; ok: boolean; result?: unknown; error?: string };
type RpcReady = { kind: "ready" };

export function createSqliteClient(options: SqliteClientOptions): SqliteClient {
  const { createWorker, lockName, channelName, label, initSchema } = options;

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

  // Spin up the dedicated worker and become the connection owner for this origin.
  async function becomeLeader(): Promise<void> {
    const worker = createWorker();
    const proxy = wrap<DbWorkerApi>(worker);
    try {
      await initSchema(proxy);
    } catch (error) {
      // OPFS SAHPool init failed even after the worker's own in-place retries.
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

  // The worker retries the OPFS pool capture in place (~5s); this respawn loop is
  // only the backstop for a worker whose init failed terminally.
  async function becomeLeaderWithRetry(signal?: AbortSignal): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      try {
        await becomeLeader();
        return;
      } catch (error) {
        if (attempt >= 2) throw error;
        await new Promise((r) => setTimeout(r, 500));
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

  // Hold the exclusive lock until released (on pagehide / takeover), then tear down
  // the worker.
  async function holdLeadershipUntilReleased(): Promise<void> {
    await new Promise<void>((resolve) => { releaseLeadership = resolve; });
    releaseLeadership = null;
    await teardownLeader();
  }

  // Followers wait in the lock queue; when the current leader releases, the first
  // waiter wins the lock here and promotes itself to leader.
  function queueLeadershipTakeover(): void {
    leadershipAbort = new AbortController();
    const signal = leadershipAbort.signal;
    void navigator.locks
      .request(lockName, { mode: "exclusive", signal }, async () => {
        await becomeLeaderWithRetry(signal);
        await holdLeadershipUntilReleased();
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // A failed takeover MUST re-queue: with no leader, every tab's RPCs would
        // time out forever. The delay keeps a persistently broken promotion from
        // spinning hot.
        console.warn(`[${label}] leadership takeover failed; re-queueing`, error);
        setTimeout(() => {
          if (role === "follower") queueLeadershipTakeover();
        }, 1000);
      });
  }

  async function elect(): Promise<void> {
    channel = new BroadcastChannel(channelName);
    channel.onmessage = handleChannelMessage;

    if (typeof navigator === "undefined" || !navigator.locks) {
      await becomeLeaderWithRetry();
      return;
    }

    // Try to grab leadership immediately; if the lock is busy another tab is already
    // the leader. The lock is only held while the request callback's promise is
    // pending, so the callback must keep awaiting holdLeadershipUntilReleased() — we
    // signal the outcome via `decided` separately.
    let resolveDecided!: (becameLeader: boolean) => void;
    let rejectDecided!: (error: unknown) => void;
    const decided = new Promise<boolean>((resolve, reject) => {
      resolveDecided = resolve;
      rejectDecided = reject;
    });

    navigator.locks
      .request(lockName, { ifAvailable: true }, async (lock) => {
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
      })
      // request() itself can reject without invoking the callback (document not
      // fully active — e.g. Chrome prerender). Unhandled, `decided` would never
      // settle and the app would hang on its first DB call. Settle it; ensureInit
      // resets state so the next call re-elects (post-activation it succeeds).
      .catch((error: unknown) => rejectDecided(error));

    if (!(await decided)) {
      role = "follower";
      queueLeadershipTakeover();
    }
  }

  function ensureInit(): Promise<void> {
    if (!roleReady) {
      roleReady = elect().catch((error: unknown) => {
        // Failed election leaves nothing behind: close the channel so a retry
        // starts clean.
        channel?.close();
        channel = null;
        roleReady = null;
        throw error;
      });
    }
    return roleReady;
  }

  // Leader executes the request against the worker and replies; followers resolve
  // their pending RPCs.
  async function handleChannelMessage(event: MessageEvent): Promise<void> {
    const msg = event.data as RpcRequest | RpcResponse | RpcReady;
    if (msg.kind === "ready") {
      // A new leader came up — resend in-flight requests that may have been dropped
      // during the gap.
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
      // A large pull page can take a while to apply on the leader; give batches
      // more headroom than point queries before declaring the leader dead.
      const timeoutMs = method === "execBatch" ? 60000 : 15000;
      setTimeout(() => {
        if (pendingRpc.delete(id)) reject(new Error(`${label} RPC timeout: ${method}`));
      }, timeoutMs);
    });
  }

  // Route a DB call: leader runs it directly on the worker; followers forward it to
  // the leader.
  async function dispatch(method: RpcMethod, args: unknown[]): Promise<unknown> {
    await ensureInit();
    if (role === "leader" && leaderProxy) {
      const fn = leaderProxy[method] as (...a: unknown[]) => Promise<unknown>;
      return fn.apply(leaderProxy, args);
    }
    return rpcCall(method, args);
  }

  async function close(): Promise<void> {
    leadershipAbort?.abort();
    leadershipAbort = null;
    if (role === "leader") releaseLeadership?.();
    channel?.close();
    channel = null;
    roleReady = null;
    role = "pending";
  }

  const closeOnPageHide = () => {
    void close();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", closeOnPageHide);
  }

  return {
    async exec(sql, bind) {
      await dispatch("exec", [sql, bind as BindingSpec | undefined]);
    },
    async execBatch(statements) {
      await dispatch("execBatch", [
        statements.map((s) => ({ sql: s.sql, bind: s.bind as BindingSpec | undefined })),
      ]);
    },
    async queryAll<T>(sql: string, bind?: unknown[]) {
      return dispatch("queryObjects", [sql, bind as BindingSpec | undefined]) as Promise<T[]>;
    },
    async queryAllArray(sql, bind) {
      return dispatch("query", [sql, bind as BindingSpec | undefined]) as Promise<SqlValue[][]>;
    },
    async queryOne<T>(sql: string, bind?: unknown[]) {
      const rows = (await dispatch("queryObjects", [sql, bind as BindingSpec | undefined])) as T[];
      return rows[0] ?? null;
    },
    async isPersistent() {
      return dispatch("isPersistent", []) as Promise<boolean>;
    },
    async dispose() {
      if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", closeOnPageHide);
      }
      await close();
    },
  };
}
