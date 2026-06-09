// Sync service: local SQLite (OPFS) ⇄ run-api (D1). Offline-first.
//
// Pull: paginated cursor delta + recent window (raw rows) + all-time rollup.
// Push: outbox pattern — every local mutation lands in sync_queue (write repos
// enqueue in the same operation as the local write) and pushDelta drains it.
//   GUARD queue-XOR-synced: tables never use the legacy synced=0 scan; the queue
//   is the only push path (local writes set synced=1).
//   GUARD single-flight: the drain runs under a Web Lock, so two tabs can never
//   ship the same queue rows twice.

import { queryAll, queryOne, exec, execBatch } from "../../db/client";
import { api } from "../../api/client";

// Raw logs/checkins/sst are pulled only for the recent window; older rows are
// fetched on demand. Must exceed the deepest "recent" read in the UI (30d). The
// rollup (log_day_counts) is always all-time, so progress/gating stay correct.
export const WINDOW_DAYS = 120;

const PUSH_LOCK = "rurana.sync.push";
const QUEUE_BATCH = 500; // mirrors the server's MAX_ROWS headroom per entity

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

// Write repos of migrated tables call this in the same operation as the local
// write. Coalesced per entity row: the latest payload supersedes any pending one
// (full-row upserts make the last write sufficient).
export async function enqueueMutation(m: QueuedMutation): Promise<void> {
  const now = Date.now();
  await execBatch([
    { sql: `DELETE FROM sync_queue WHERE entity = ? AND entity_id = ?`, bind: [m.entity, m.entityId] },
    {
      sql: `INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
      bind: [crypto.randomUUID(), m.entity, m.entityId, m.operation, JSON.stringify(m.payload), now, now],
    },
  ]);
}

// Enqueue the row's CURRENT state as the payload (full-row upsert). Reading after
// the local write guarantees payload === what the user sees; the server's zod
// schema strips any column it doesn't accept (synced, user_id, done, …).
// No-op when the row doesn't exist (e.g. soft-deleting a never-saved set).
export async function enqueueRowSnapshot(entity: SyncEntity, table: string, id: string): Promise<void> {
  const row = await queryOne<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  if (!row) return;
  delete row.synced;
  await enqueueMutation({ entity, entityId: id, operation: "upsert", payload: row });
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

// One statement builder per table the pull can return. Reused across pages: a
// paginated page carries just one table, the first page also the reference tables.
type RowBuilder = (row: Record<string, unknown>) => { sql: string; bind: unknown[] };

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
    sql: `INSERT OR REPLACE INTO exercises (id, phase_id, name, detail, sets, reps, duration_s, exercise_type, sort_order, video_url, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    bind: [row.id, row.phase_id, row.name, row.detail ?? null, row.sets ?? null,
           row.reps ?? null, row.duration_s ?? null, row.exercise_type, row.sort_order ?? 0, row.video_url ?? null],
  }),
  phase_criteria: (row) => ({
    sql: `INSERT INTO phase_criteria (id, phase_id, description, done, deleted_at, synced)
          VALUES (?, ?, ?, ?, ?, 1)
          ON CONFLICT(id) DO UPDATE SET phase_id = excluded.phase_id, description = excluded.description, done = excluded.done, deleted_at = excluded.deleted_at, synced = 1`,
    bind: [row.id, row.phase_id, row.description, row.done ?? 0, row.deleted_at ?? null],
  }),
  pain_checkins: (row) => ({
    sql: `INSERT OR REPLACE INTO pain_checkins (id, user_id, injury_id, date, zones, created_at, synced)
          VALUES (?, ?, ?, ?, ?, ?, 1)`,
    bind: [row.id, row.user_id, row.injury_id ?? null, row.date, row.zones, row.created_at],
  }),
  exercise_logs: (row) => ({
    sql: `INSERT OR REPLACE INTO exercise_logs (id, user_id, exercise_id, session_date, reps_done, pain_during, rpe, note, completed_at, deleted_at, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    bind: [row.id, row.user_id, row.exercise_id, row.session_date, row.reps_done ?? null,
           row.pain_during ?? null, row.rpe ?? null, row.note ?? null, row.completed_at ?? null, row.deleted_at ?? null],
  }),
  sst_results: (row) => ({
    sql: `INSERT OR REPLACE INTO sst_results (id, user_id, injury_id, date, strength_score, pain_score, note, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    bind: [row.id, row.user_id, row.injury_id, row.date, row.strength_score ?? null,
           row.pain_score ?? null, row.note ?? null],
  }),
  // Global reference content (no user scope); never pushed back.
  prom_instruments: (row) => ({
    sql: `INSERT OR REPLACE INTO prom_instruments (id, name, zones, questions, max_per_item, invert, better_is_higher, every_days, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    bind: [row.id, row.name, row.zones, row.questions, row.max_per_item,
           row.invert ?? 0, row.better_is_higher ?? 0, row.every_days ?? 14, row.sort_order ?? 0],
  }),
  prom_results: (row) => ({
    sql: `INSERT OR REPLACE INTO prom_results (id, user_id, injury_id, instrument_id, date, score, answers, note, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    bind: [row.id, row.user_id, row.injury_id, row.instrument_id, row.date,
           row.score ?? null, row.answers ?? null, row.note ?? null],
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

function applyPage(data: Record<string, unknown>): Array<{ sql: string; bind: unknown[] }> {
  const statements: Array<{ sql: string; bind: unknown[] }> = [];
  for (const [table, build] of Object.entries(BUILDERS)) {
    const rows = data[table];
    if (Array.isArray(rows)) for (const row of rows) statements.push(build(row as Record<string, unknown>));
  }
  return statements;
}

export async function pullDelta({ force = false }: { force?: boolean } = {}): Promise<void> {
  // Checkpoint stored as ms (matches serverTime = Date.now()); API compares
  // updated_at > since (also ms). metadata first, legacy users.last_sync fallback.
  const metaSince = await getMeta("last_pull_at");
  const legacy = await queryOne<{ last_sync: number }>(`SELECT last_sync FROM users LIMIT 1`);
  const since = force ? 0 : metaSince != null ? Number(metaSince) : (legacy?.last_sync ?? 0);

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

    const statements = applyPage(data);
    if (statements.length > 0) await execBatch(statements);

    cursor = data.nextCursor ?? null;
  } while (cursor);

  if (serverTime != null) {
    await setMeta("last_pull_at", String(serverTime));
    // Legacy checkpoint kept mirrored (rollback safety); not deleted on purpose.
    await exec(`UPDATE users SET last_sync = ?`, [serverTime]);
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
  const statements = applyPage(data); // only data[table] is present
  if (statements.length > 0) await execBatch(statements);
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

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
async function drainAll(): Promise<void> {
  while (await pushOnce()) { /* next batch */ }
}

// Pushes one batch; returns true when a full batch shipped (more may remain).
async function pushOnce(): Promise<boolean> {
  // Drain in creation order so parents ship with (or before) their children:
  // a phase enqueued before its exercises/criteria lands in the same body, and the
  // server applies tables in dependency order (phases → exercises → criteria → done).
  const queued = await queryAll<{ id: string; entity: string; payload_json: string }>(
    `SELECT id, entity, payload_json FROM sync_queue ORDER BY created_at, rowid LIMIT ${QUEUE_BATCH}`,
  );
  if (queued.length === 0) return false;

  const body: Record<string, unknown[]> = {};
  const shipped: string[] = [];
  for (const r of queued) {
    const key = BODY_KEY[r.entity as SyncEntity];
    if (!key) continue; // unknown entity (version skew): leave it queued, never drop data
    (body[key] ??= []).push(JSON.parse(r.payload_json));
    shipped.push(r.id);
  }
  if (shipped.length === 0) return false;

  try {
    await api.post("/api/sync/push", body);
  } catch (error) {
    // Record the failure on the drained rows (visibility + debugging); they stay
    // pending and retry on the next push.
    const placeholders = shipped.map(() => "?").join(",");
    await exec(
      `UPDATE sync_queue SET attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id IN (${placeholders})`,
      [error instanceof Error ? error.message : String(error), Date.now(), ...shipped],
    ).catch(() => {});
    throw error;
  }

  // Success. Delete exactly the queue rows we pushed (by queue id): a mutation
  // enqueued *during* the request has a different id and survives for the next push.
  const placeholders = shipped.map(() => "?").join(",");
  await exec(`DELETE FROM sync_queue WHERE id IN (${placeholders})`, shipped);
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
