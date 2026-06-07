// Sync local SQLite (OPFS) with run-api (D1).
// Strategy: offline-first. Pull delta on app start; push unsynced rows after mutations.

import { queryAll, exec, execBatch } from "./client";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

// Raw logs/checkins/sst are pulled only for the recent window; older rows are
// fetched on demand. Must exceed the deepest "recent" read in the UI (30d). The
// rollup (log_day_counts) is always all-time, so progress/gating stay correct.
export const WINDOW_DAYS = 120;

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
  const users = await queryAll<{ last_sync: number }>(`SELECT last_sync FROM users LIMIT 1`);
  // last_sync stored as ms (matches serverTime = Date.now()); API compares updated_at > since (also ms)
  const since = force ? 0 : (users[0]?.last_sync ?? 0);

  // Loop the cursor until the server drains every stream. Bound per page server-side
  // so a deep history can't blow up one response. last_sync is advanced only after a
  // full drain, so an interrupted run re-pulls from `since` (idempotent upserts).
  let cursor: string | null = null;
  let serverTime: number | null = null;

  do {
    const url = new URL(`${API_BASE}/api/sync/pull`);
    url.searchParams.set("since", String(since));
    url.searchParams.set("windowDays", String(WINDOW_DAYS));
    if (cursor) url.searchParams.set("cursor", cursor);

    // Auth via httpOnly session cookie (credentials: include); no JS-held token.
    const res = await fetch(url.toString(), { credentials: "include" });
    if (!res.ok) return; // abort; last_sync untouched → safe retry next time

    const data = await res.json() as Record<string, unknown> & {
      serverTime: number; nextCursor: string | null;
    };
    serverTime ??= data.serverTime;

    const statements = applyPage(data);
    if (statements.length > 0) await execBatch(statements);

    cursor = data.nextCursor ?? null;
  } while (cursor);

  if (serverTime != null) {
    await exec(`UPDATE users SET last_sync = ?`, [serverTime]);
    // Checkpoint so last_sync reaches the main .db file; the leader worker flushes OPFS on close.
    await exec(`PRAGMA wal_checkpoint(PASSIVE)`);
  }
}

// Fetch raw rows for one day older than the sync window (e.g. opening an old day
// in the calendar). Upserts locally without touching last_sync — the rollup is
// untouched, so this is a pure cache fill. No-op result if the day has no rows.
export async function pullHistory(
  table: "exercise_logs" | "pain_checkins" | "sst_results", date: string,
): Promise<void> {
  const url = new URL(`${API_BASE}/api/sync/pull`);
  url.searchParams.set("mode", "history");
  url.searchParams.set("table", table);
  url.searchParams.set("date", date);

  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) return;

  const data = await res.json() as Record<string, unknown>;
  const statements = applyPage(data); // only data[table] is present
  if (statements.length > 0) await execBatch(statements);
}

export async function pushDelta(): Promise<void> {
  const checkins = await queryAll<{ id: string }>(`SELECT * FROM pain_checkins WHERE synced = 0`);
  const logs = await queryAll<{ id: string }>(`SELECT * FROM exercise_logs WHERE synced = 0`);
  const sst = await queryAll<{ id: string }>(`SELECT * FROM sst_results WHERE synced = 0`);
  const proms = await queryAll<{ id: string }>(`SELECT * FROM prom_results WHERE synced = 0`);
  const criteria = await queryAll<{ id: string; done: number }>(`SELECT id, done FROM phase_criteria WHERE synced = 0`);
  // Admin-style edits. injuries: only current_phase_id + focus_days sync (UPDATE-only server-side).
  const injuries = await queryAll<{ id: string; current_phase_id: string | null; focus_days: string | null }>(
    `SELECT id, current_phase_id, focus_days FROM injuries WHERE synced = 0`);
  const phaseRows = await queryAll<{ id: string }>(`SELECT * FROM phases WHERE synced = 0`);
  // Exercise authoring (config/video/type). Full row pushed; server upserts with ownership guard.
  const exerciseRows = await queryAll<{ id: string }>(`SELECT * FROM exercises WHERE synced = 0`);
  // phase_criteria rows ride a channel separate from criteria_done (which carries per-user done state).
  const criteriaRows = await queryAll<{ id: string; phase_id: string; description: string; deleted_at: number | null }>(
    `SELECT id, phase_id, description, deleted_at FROM phase_criteria WHERE synced = 0`);

  if (checkins.length === 0 && logs.length === 0 && sst.length === 0 && proms.length === 0 && criteria.length === 0 &&
      injuries.length === 0 && phaseRows.length === 0 && exerciseRows.length === 0 && criteriaRows.length === 0) return;

  const res = await fetch(`${API_BASE}/api/sync/push`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pain_checkins: checkins,
      exercise_logs: logs,
      sst_results: sst,
      prom_results: proms,
      criteria_done: criteria.map((r) => ({ criteria_id: r.id, done: Boolean(r.done) })),
      injuries,
      phases: phaseRows,
      exercises: exerciseRows,
      phase_criteria: criteriaRows,
    }),
  });

  if (res.ok) {
    // Mark only the rows we actually pushed (by ID) to avoid a TOCTOU race
    // where new unsynced rows inserted during the fetch get incorrectly marked synced.
    const markSynced = async (table: string, ids: string[]) => {
      if (ids.length === 0) return;
      const placeholders = ids.map(() => "?").join(",");
      await exec(`UPDATE ${table} SET synced = 1 WHERE id IN (${placeholders})`, ids);
    };
    await markSynced("pain_checkins", checkins.map((r) => r.id));
    await markSynced("exercise_logs", logs.map((r) => r.id));
    await markSynced("sst_results", sst.map((r) => r.id));
    await markSynced("prom_results", proms.map((r) => r.id));
    await markSynced("injuries", injuries.map((r) => r.id));
    await markSynced("phases", phaseRows.map((r) => r.id));
    await markSynced("exercises", exerciseRows.map((r) => r.id));
    // Covers both the criteria_done and phase_criteria channels (same rows).
    await markSynced("phase_criteria", Array.from(new Set([...criteria.map((r) => r.id), ...criteriaRows.map((r) => r.id)])));
  }
}
