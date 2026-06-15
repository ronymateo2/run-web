// Sync service: local SQLite (OPFS) ⇄ run-api (D1). Offline-first.
//
// Pull: paginated cursor delta + recent window (raw rows) + all-time rollup.
//   The checkpoint re-pulls a small overlap window (idempotent upserts) so a push
//   that committed just after a pull's serverTime can never be skipped forever.
//   Rows with a pending outbox entry are NOT overwritten by the pull (local edit wins
//   until it ships). After a full drain, raw rows older than the window are purged.
// Push: outbox pattern — every local mutation lands in sync_queue atomically with the
// local write (repos run both in ONE execBatch) and pushDelta drains it.
//   GUARD queue-XOR-synced: tables never use the legacy synced=0 scan; the queue
//   is the only push path (local writes set synced=1).
//   GUARD single-flight: the drain runs under a Web Lock, so two tabs can never
//   ship the same queue rows twice.
//   The server answers per row: applied/stale → queue row deleted; invalid → dead-letter
//   immediately; rejected (e.g. missing parent) → retry, dead-letter after MAX_ATTEMPTS.
//   Dead-lettered rows (status='failed') keep their payload and surface in Perfil.

import { queryAll, queryOne, exec, execBatch } from "../../db/client";
import { api } from "../../api/client";

// Raw logs/checkins/sst are pulled only for the recent window; older rows are
// fetched on demand. Must exceed the deepest "recent" read in the UI (30d). The
// rollup (log_day_counts) is always all-time, so progress/gating stay correct.
export const WINDOW_DAYS = 120;

const PUSH_LOCK = "rurana.sync.push";
const QUEUE_BATCH = 500; // mirrors the server's MAX_ROWS headroom per entity
const MAX_ATTEMPTS = 5; // rejected rows retry this many times, then dead-letter
// Re-pull this much behind the checkpoint: covers a push whose D1 commit landed
// after a concurrent pull's serverTime (clock-vs-commit race). Re-pulled rows are
// idempotent upserts, so the overlap costs almost nothing.
const PULL_OVERLAP_MS = 60_000;

// ---------------------------------------------------------------------------
// metadata helpers (Fase 0): pull checkpoint lives in `metadata.last_pull_at`,
// falling back to the legacy `users.last_sync` (still mirrored, never deleted).
// ---------------------------------------------------------------------------

async function getMeta(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string }>(`SELECT value FROM metadata WHERE key = ?`, [key]);
  return row?.value ?? null;
}

async function setMeta(key: string, value: string): Promise<void> {
  await exec(
    `INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

// ---------------------------------------------------------------------------
// Outbox (sync_queue)
// ---------------------------------------------------------------------------

// Entity → key in the POST /api/sync/push body. `criteria_done` is a separate
// channel from `phase_criterion` on purpose: done state is per-user
// (user_criteria_done server-side) while the criterion row is plan content.
const BODY_KEY = {
  checkin: "pain_checkins",
  exercise_log: "exercise_logs",
  sst: "sst_results",
  prom: "prom_results",
  injury: "injuries",
  phase: "phases",
  exercise: "exercises",
  phase_criterion: "phase_criteria",
  criteria_done: "criteria_done",
} as const;

export type SyncEntity = keyof typeof BODY_KEY;
export type SyncOperation = "upsert" | "update" | "delete";

export interface QueuedMutation {
  entity: SyncEntity;
  entityId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
}

export interface SqlStatement {
  sql: string;
  bind: unknown[];
}

// Statements that enqueue a mutation. Repos append these to their local-write
// statements and run everything in ONE execBatch — a crash can never commit the
// write without its queue entry. Coalesced per entity row: the latest payload
// supersedes any pending one (full-row upserts make the last write sufficient).
// client_updated_at (LWW timestamp for the server) is stamped here.
export function buildQueueStatements(m: QueuedMutation): SqlStatement[] {
  const now = Date.now();
  const payload = { ...m.payload, client_updated_at: now };
  return [
    { sql: `DELETE FROM sync_queue WHERE entity = ? AND entity_id = ?`, bind: [m.entity, m.entityId] },
    {
      sql: `INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
      bind: [crypto.randomUUID(), m.entity, m.entityId, m.operation, JSON.stringify(payload), now, now],
    },
  ];
}

// Standalone enqueue for mutations whose local write happened elsewhere. Prefer
// buildQueueStatements inside the repo's own execBatch (atomic with the write).
export async function enqueueMutation(m: QueuedMutation): Promise<void> {
  await execBatch(buildQueueStatements(m));
}

// Read a row's current state as a push payload (full-row upsert; the server's zod
// schema strips any column it doesn't accept — synced, user_id, done, …).
// Returns null when the row doesn't exist (e.g. soft-deleting a never-saved set).
export async function readRowSnapshot(table: string, id: string): Promise<Record<string, unknown> | null> {
  const row = await queryOne<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  if (!row) return null;
  delete row.synced;
  return row;
}

// ---------------------------------------------------------------------------
// Outbox status (Perfil UI)
// ---------------------------------------------------------------------------

export interface SyncQueueStatus {
  pending: number;
  failed: number;
  lastError: string | null;
}

export async function getSyncQueueStatus(): Promise<SyncQueueStatus> {
  const row = await queryOne<{ pending: number; failed: number }>(
    `SELECT SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
     FROM sync_queue`,
  );
  const err = await queryOne<{ last_error: string }>(
    `SELECT last_error FROM sync_queue WHERE last_error IS NOT NULL ORDER BY updated_at DESC LIMIT 1`,
  );
  return { pending: row?.pending ?? 0, failed: row?.failed ?? 0, lastError: err?.last_error ?? null };
}

// Re-arm dead-lettered mutations (status='failed') for the next push.
export async function retryFailedMutations(): Promise<void> {
  await exec(`UPDATE sync_queue SET status = 'pending', attempts = 0, updated_at = ? WHERE status = 'failed'`, [Date.now()]);
}

// Drop dead-lettered mutations for good (the server keeps its version).
export async function discardFailedMutations(): Promise<void> {
  await exec(`DELETE FROM sync_queue WHERE status = 'failed'`);
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

// One statement builder per table the pull can return. Reused across pages: a
// paginated page carries just one table, the first page also the reference tables.
type RowBuilder = (row: Record<string, unknown>) => SqlStatement;

const BUILDERS: Record<string, RowBuilder> = {
  injuries: (row) => ({
    sql: `INSERT OR REPLACE INTO injuries (id, user_id, name, zone, status, current_phase_id, focus_days, started_at, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    bind: [row.id, row.user_id, row.name, row.zone, row.status, row.current_phase_id ?? null,
           row.focus_days ?? null, row.started_at ?? null],
  }),
  phases: (row) => ({
    sql: `INSERT OR REPLACE INTO phases (id, injury_id, phase_num, name, description, week_start, week_end, threshold_pct, focus_days, deleted_at, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    bind: [row.id, row.injury_id, row.phase_num, row.name, row.description ?? null,
           row.week_start, row.week_end, row.threshold_pct, row.focus_days ?? null, row.deleted_at ?? null],
  }),
  exercises: (row) => ({
    sql: `INSERT OR REPLACE INTO exercises (id, phase_id, name, detail, sets, reps, duration_s, exercise_type, sort_order, video_url, warmup_sets, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    bind: [row.id, row.phase_id, row.name, row.detail ?? null, row.sets ?? null,
           row.reps ?? null, row.duration_s ?? null, row.exercise_type, row.sort_order ?? 0, row.video_url ?? null,
           row.warmup_sets ?? 0],
  }),
  phase_criteria: (row) => ({
    sql: `INSERT INTO phase_criteria (id, phase_id, description, done, deleted_at, synced)
          VALUES (?, ?, ?, ?, ?, 1)
          ON CONFLICT(id) DO UPDATE SET phase_id = excluded.phase_id, description = excluded.description, done = excluded.done, deleted_at = excluded.deleted_at, synced = 1`,
    bind: [row.id, row.phase_id, row.description, row.done ?? 0, row.deleted_at ?? null],
  }),
  pain_checkins: (row) => ({
    sql: `INSERT OR REPLACE INTO pain_checkins (id, user_id, injury_id, date, zones, created_at, deleted_at, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    bind: [row.id, row.user_id, row.injury_id ?? null, row.date, row.zones, row.created_at, row.deleted_at ?? null],
  }),
  exercise_logs: (row) => ({
    sql: `INSERT OR REPLACE INTO exercise_logs (id, user_id, exercise_id, session_date, reps_done, pain_during, rpe, note, set_type, completed_at, deleted_at, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    bind: [row.id, row.user_id, row.exercise_id, row.session_date, row.reps_done ?? null,
           row.pain_during ?? null, row.rpe ?? null, row.note ?? null, row.set_type ?? "normal", row.completed_at ?? null, row.deleted_at ?? null],
  }),
  sst_results: (row) => ({
    sql: `INSERT OR REPLACE INTO sst_results (id, user_id, injury_id, date, strength_score, pain_score, note, deleted_at, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    bind: [row.id, row.user_id, row.injury_id, row.date, row.strength_score ?? null,
           row.pain_score ?? null, row.note ?? null, row.deleted_at ?? null],
  }),
  // Global reference content (no user scope); never pushed back.
  prom_instruments: (row) => ({
    sql: `INSERT OR REPLACE INTO prom_instruments (id, name, zones, questions, max_per_item, invert, better_is_higher, every_days, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    bind: [row.id, row.name, row.zones, row.questions, row.max_per_item,
           row.invert ?? 0, row.better_is_higher ?? 0, row.every_days ?? 14, row.sort_order ?? 0],
  }),
  prom_results: (row) => ({
    sql: `INSERT OR REPLACE INTO prom_results (id, user_id, injury_id, instrument_id, date, score, answers, note, deleted_at, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    bind: [row.id, row.user_id, row.injury_id, row.instrument_id, row.date,
           row.score ?? null, row.answers ?? null, row.note ?? null, row.deleted_at ?? null],
  }),
  // Server-derived rollup; never pushed back. Authoritative count overwrites any
  // optimistic local value.
  log_day_counts: (row) => ({
    sql: `INSERT INTO log_day_counts (user_id, exercise_id, session_date, sets)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, exercise_id, session_date) DO UPDATE SET sets = excluded.sets`,
    bind: [row.user_id, row.exercise_id, row.session_date, row.sets ?? 0],
  }),
};

// Pulled table → outbox entities that edit it. A row with a PENDING queue entry is
// skipped by the pull: the local (newer) edit must not be clobbered by the server
// echo; it wins until it ships. Failed (dead-lettered) entries do NOT block the
// pull — the server is authoritative for them until the user retries.
const QUEUE_ENTITIES_BY_TABLE: Partial<Record<string, SyncEntity[]>> = {
  injuries: ["injury"],
  phases: ["phase"],
  exercises: ["exercise"],
  phase_criteria: ["phase_criterion", "criteria_done"],
  pain_checkins: ["checkin"],
  exercise_logs: ["exercise_log"],
  sst_results: ["sst"],
  prom_results: ["prom"],
};

async function getPendingSkipSet(): Promise<Set<string>> {
  const rows = await queryAll<{ entity: string; entity_id: string }>(
    `SELECT entity, entity_id FROM sync_queue WHERE status = 'pending'`,
  );
  return new Set(rows.map((r) => `${r.entity}:${r.entity_id}`));
}

function applyPage(data: Record<string, unknown>, skip: Set<string>): SqlStatement[] {
  const statements: SqlStatement[] = [];
  for (const [table, build] of Object.entries(BUILDERS)) {
    const rows = data[table];
    if (!Array.isArray(rows)) continue;
    const entities = QUEUE_ENTITIES_BY_TABLE[table];
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      if (entities && skip.size > 0 && entities.some((e) => skip.has(`${e}:${String(r.id)}`))) continue;
      statements.push(build(r));
    }
  }
  return statements;
}

// Raw rows older than the window are purged after a full pull: the rollup keeps
// progress/gating correct and pullHistory re-fetches any old day on demand.
// Rows still referenced by the outbox are never purged.
async function purgeOutsideWindow(): Promise<void> {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  await execBatch([
    { sql: `DELETE FROM exercise_logs WHERE session_date < ? AND id NOT IN (SELECT entity_id FROM sync_queue WHERE entity = 'exercise_log')`, bind: [cutoff] },
    { sql: `DELETE FROM pain_checkins WHERE date < ? AND id NOT IN (SELECT entity_id FROM sync_queue WHERE entity = 'checkin')`, bind: [cutoff] },
    { sql: `DELETE FROM sst_results WHERE date < ? AND id NOT IN (SELECT entity_id FROM sync_queue WHERE entity = 'sst')`, bind: [cutoff] },
  ]);
}

export async function pullDelta({ force = false }: { force?: boolean } = {}): Promise<void> {
  // Checkpoint stored as ms (matches serverTime = Date.now()); API compares
  // updated_at > since (also ms). metadata first, legacy users.last_sync fallback.
  const metaSince = await getMeta("last_pull_at");
  const legacy = await queryOne<{ last_sync: number }>(`SELECT last_sync FROM users LIMIT 1`);
  const base = force ? 0 : metaSince != null ? Number(metaSince) : (legacy?.last_sync ?? 0);
  // Overlap window: see PULL_OVERLAP_MS. Upserts make the re-pull idempotent.
  const since = base > 0 ? Math.max(0, base - PULL_OVERLAP_MS) : 0;

  // Loop the cursor until the server drains every stream. Bound per page server-side
  // so a deep history can't blow up one response. The checkpoint is advanced only after
  // a full drain, so an interrupted run re-pulls from `since` (idempotent upserts).
  let cursor: string | null = null;
  let serverTime: number | null = null;

  do {
    const params = new URLSearchParams({ since: String(since), windowDays: String(WINDOW_DAYS) });
    if (cursor) params.set("cursor", cursor);

    const data = await api.get<Record<string, unknown> & { serverTime: number; nextCursor: string | null }>(
      `/api/sync/pull?${params.toString()}`,
    );
    serverTime ??= data.serverTime;

    // Re-read per page: a mutation enqueued while this pull was in flight must also
    // be protected from the overwrite.
    const skip = await getPendingSkipSet();
    const statements = applyPage(data, skip);
    if (statements.length > 0) await execBatch(statements);

    cursor = data.nextCursor ?? null;
  } while (cursor);

  if (serverTime != null) {
    await setMeta("last_pull_at", String(serverTime));
    // Legacy checkpoint kept mirrored (rollback safety); not deleted on purpose.
    await exec(`UPDATE users SET last_sync = ?`, [serverTime]);
    await purgeOutsideWindow();
    // Checkpoint so the watermark reaches the main .db file; the leader worker flushes OPFS on close.
    await exec(`PRAGMA wal_checkpoint(PASSIVE)`);
  }
}

// Fetch raw rows for one day older than the sync window (e.g. opening an old day
// in the calendar). Upserts locally without touching the checkpoint — the rollup is
// untouched, so this is a pure cache fill. Best-effort: failures leave the cache cold.
export async function pullHistory(
  table: "exercise_logs" | "pain_checkins" | "sst_results", date: string,
): Promise<void> {
  let data: Record<string, unknown>;
  try {
    data = await api.get<Record<string, unknown>>(
      `/api/sync/pull?mode=history&table=${table}&date=${encodeURIComponent(date)}`,
    );
  } catch {
    return; // offline/401 → the caller simply renders without the old rows
  }
  const skip = await getPendingSkipSet();
  const statements = applyPage(data, skip); // only data[table] is present
  if (statements.length > 0) await execBatch(statements);
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

// Per-row outcome from POST /sync/push (see the server for exact semantics).
type RowStatus = "applied" | "stale" | "rejected" | "invalid";
interface PushResponse {
  serverTime: number;
  synced: number;
  // Keyed by body table, aligned with the submitted array order. Absent on an
  // old server → legacy behavior (treat everything as applied).
  results?: Record<string, RowStatus[]>;
}

export async function pushDelta(): Promise<void> {
  // GUARD single-flight drain: only one tab may push at a time — concurrent drains
  // would ship the same queue rows twice. If the lock is busy another tab is already
  // pushing; skip — queue rows and synced flags survive for the next push.
  if (typeof navigator !== "undefined" && navigator.locks) {
    await navigator.locks.request(PUSH_LOCK, { ifAvailable: true }, async (lock) => {
      if (lock) await drainAll();
    });
    return;
  }
  await drainAll();
}

// Keep pushing batches until the queue is drained (deep backlogs span requests).
// Rejected rows stay pending with attempts+1, so a batch full of them loops at
// most MAX_ATTEMPTS times before everything dead-letters.
async function drainAll(): Promise<void> {
  while (await pushOnce()) { /* next batch */ }
}

// Pushes one batch; returns true when a full batch shipped (more may remain).
async function pushOnce(): Promise<boolean> {
  // Drain in creation order so parents ship with (or before) their children:
  // a phase enqueued before its exercises/criteria lands in the same body, and the
  // server applies tables in dependency order (phases → exercises → criteria → done).
  const queued = await queryAll<{ id: string; entity: string; payload_json: string; attempts: number }>(
    `SELECT id, entity, payload_json, attempts FROM sync_queue WHERE status = 'pending' ORDER BY created_at, rowid LIMIT ${QUEUE_BATCH}`,
  );
  if (queued.length === 0) return false;

  const body: Record<string, unknown[]> = {};
  const shipped: Array<{ qid: string; key: string; idx: number; attempts: number }> = [];
  for (const r of queued) {
    const key = BODY_KEY[r.entity as SyncEntity];
    if (!key) continue; // unknown entity (version skew): leave it queued, never drop data
    const idx = (body[key] ??= []).push(JSON.parse(r.payload_json)) - 1;
    shipped.push({ qid: r.id, key, idx, attempts: r.attempts });
  }
  if (shipped.length === 0) return false;

  let response: PushResponse;
  try {
    response = await api.post<PushResponse>("/api/sync/push", body);
  } catch (error) {
    // Network/server failure: record it on the drained rows (visibility + debugging);
    // they stay pending and retry on the next push. Never dead-letter here — offline
    // is a normal state, not a poison row.
    const placeholders = shipped.map(() => "?").join(",");
    await exec(
      `UPDATE sync_queue SET attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id IN (${placeholders})`,
      [error instanceof Error ? error.message : String(error), Date.now(), ...shipped.map((s) => s.qid)],
    ).catch(() => {});
    throw error;
  }

  // Resolve every shipped row by its per-row status. Deleting/updating by queue id:
  // a mutation enqueued *during* the request has a different id and survives.
  const now = Date.now();
  const statements: SqlStatement[] = [];
  for (const s of shipped) {
    const status: RowStatus = response.results?.[s.key]?.[s.idx] ?? "applied";
    if (status === "applied" || status === "stale") {
      // applied: landed. stale: the server has a newer edit (LWW) — drop ours,
      // the next pull reconciles local state.
      statements.push({ sql: `DELETE FROM sync_queue WHERE id = ?`, bind: [s.qid] });
    } else if (status === "invalid") {
      // Schema-invalid payload can never succeed → dead-letter immediately.
      statements.push({
        sql: `UPDATE sync_queue SET status = 'failed', attempts = attempts + 1, last_error = 'invalid', updated_at = ? WHERE id = ?`,
        bind: [now, s.qid],
      });
    } else {
      // rejected: usually a parent missing server-side. Retry (it may land in a
      // later batch), dead-letter after MAX_ATTEMPTS so it can't poison the queue.
      const failed = s.attempts + 1 >= MAX_ATTEMPTS;
      statements.push({
        sql: `UPDATE sync_queue SET status = ?, attempts = attempts + 1, last_error = 'rejected', updated_at = ? WHERE id = ?`,
        bind: [failed ? "failed" : "pending", now, s.qid],
      });
    }
  }
  await execBatch(statements);
  return queued.length === QUEUE_BATCH;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

// Push first so local mutations reach the server before the pull, then pull the
// merged state back (the server echo confirms what landed).
export async function syncNow({ forcePull = false }: { forcePull?: boolean } = {}): Promise<void> {
  await pushDelta();
  await pullDelta({ force: forcePull });
}
