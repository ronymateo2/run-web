import { eq, and, isNull, gt, lt, desc } from "drizzle-orm";
import { exercises, exerciseLogs, phases, logDayCounts } from "../schema";
import type { DrizzleDb } from "../drizzle";
import type { SqlStatement } from "../client";

export type Exercise = typeof exercises.$inferSelect;
export type ExerciseLog = typeof exerciseLogs.$inferSelect;
export type NewExerciseLog = Omit<typeof exerciseLogs.$inferInsert, "synced" | "deleted_at">;

// Authoring an exercise: editable fields plus phase_id/name/detail carried unchanged so
// the full-row push to D1 doesn't null them. Reps-based exercises may also carry an
// optional duration_s; time-only exercises have reps null.
export type ExerciseInput = {
  id: string;
  phase_id: string;
  name: string;
  detail: string | null;
  sets: number | null;
  reps: number | null;
  duration_s: number | null;
  exercise_type: Exercise["exercise_type"];
  sort_order: number | null;
  video_url: string | null;
  warmup_sets: number;
};

// Soft-deleted rows (deselected sets) are excluded from every read/count. Use this
// predicate everywhere so the filter can't be forgotten.
const notDeleted = isNull(exerciseLogs.deleted_at);

export async function getExercisesForPhase(db: DrizzleDb, phaseId: string): Promise<Exercise[]> {
  return db.select().from(exercises)
    .where(eq(exercises.phase_id, phaseId))
    .orderBy(exercises.sort_order);
}

export async function getExerciseById(db: DrizzleDb, id: string): Promise<Exercise | null> {
  const rows = await db.select().from(exercises).where(eq(exercises.id, id));
  return rows[0] ?? null;
}

export async function getTodayLogs(db: DrizzleDb, userId: string, date: string): Promise<ExerciseLog[]> {
  return db.select().from(exerciseLogs)
    .where(and(eq(exerciseLogs.user_id, userId), eq(exerciseLogs.session_date, date), notDeleted));
}

export async function getLogsForExercise(
  db: DrizzleDb, userId: string, exerciseId: string, date: string
): Promise<ExerciseLog[]> {
  return db.select().from(exerciseLogs)
    .where(and(
      eq(exerciseLogs.user_id, userId),
      eq(exerciseLogs.exercise_id, exerciseId),
      eq(exerciseLogs.session_date, date),
      notDeleted,
    ))
    .orderBy(exerciseLogs.completed_at);
}

export async function getAllLogsForExercise(
  db: DrizzleDb, userId: string, exerciseId: string
): Promise<ExerciseLog[]> {
  return db.select().from(exerciseLogs)
    .where(and(
      eq(exerciseLogs.user_id, userId),
      eq(exerciseLogs.exercise_id, exerciseId),
      notDeleted,
    ))
    .orderBy(exerciseLogs.session_date, exerciseLogs.completed_at);
}

// Most recent session strictly before `beforeDate` for this exercise, with its raw
// set logs (same shape/order as getLogsForExercise). Drives the "PREVIO" ghost column.
// Note: exerciseLogs raw is windowed to 120d — a previous session older than that has no
// local raw and yields null (acceptable for active rehab; could fall back to pullHistory).
export async function getLastSessionForExercise(
  db: DrizzleDb, userId: string, exerciseId: string, beforeDate: string
): Promise<{ date: string; logs: ExerciseLog[] } | null> {
  const base = and(
    eq(exerciseLogs.user_id, userId),
    eq(exerciseLogs.exercise_id, exerciseId),
    lt(exerciseLogs.session_date, beforeDate),
    notDeleted,
  );
  const latest = await db.select({ session_date: exerciseLogs.session_date })
    .from(exerciseLogs)
    .where(base)
    .orderBy(desc(exerciseLogs.session_date))
    .limit(1);
  const date = latest[0]?.session_date;
  if (!date) return null;
  const logs = await getLogsForExercise(db, userId, exerciseId, date);
  return { date, logs };
}

export async function getPhaseExerciseProgress(
  db: DrizzleDb, phaseId: string, userId: string
): Promise<number> {
  const allExercises = await db.select({ id: exercises.id, sets: exercises.sets })
    .from(exercises)
    .where(eq(exercises.phase_id, phaseId));
  if (allExercises.length === 0) return 0;

  // Per (exercise, day) set counts come pre-aggregated from the rollup, so this
  // reads all-time progress without scanning (possibly windowed-out) raw logs.
  const rows = await db.select({
    exercise_id: logDayCounts.exercise_id,
    sets: logDayCounts.sets,
  })
    .from(logDayCounts)
    .innerJoin(exercises, eq(logDayCounts.exercise_id, exercises.id))
    .where(and(eq(logDayCounts.user_id, userId), eq(exercises.phase_id, phaseId), gt(logDayCounts.sets, 0)));

  const required = new Map(allExercises.map(e => [e.id, e.sets ?? 1]));
  const done = new Set<string>();
  for (const r of rows) {
    if (r.sets >= (required.get(r.exercise_id) ?? 1)) done.add(r.exercise_id);
  }

  return Math.round((done.size / allExercises.length) * 100);
}

/**
 * Phase progress as a fraction of the planned work over the phase.
 *
 * Denominator = weeks × focus_days/week × exercises in phase
 *   (total exercise-completions expected across the whole phase).
 * Numerator   = Σ per (exercise, session_date) of min(sets_done / sets_required, 1)
 *   so a partially-done exercise counts as a fraction (3 of 6 sets = 0.5).
 *
 * Each exercise_logs row = one set performed.
 */
export async function getPhaseProgress(
  db: DrizzleDb,
  phase: { id: string; week_start: number; week_end: number },
  focusDaysJson: string | null | undefined,
  userId: string,
): Promise<number> {
  const phaseExercises = await db.select({ id: exercises.id, sets: exercises.sets })
    .from(exercises)
    .where(eq(exercises.phase_id, phase.id));
  if (phaseExercises.length === 0) return 0;

  const weeks = phase.week_end - phase.week_start + 1;
  let focusDays = 0;
  try { focusDays = focusDaysJson ? (JSON.parse(focusDaysJson) as string[]).length : 0; }
  catch { focusDays = 0; }
  const denom = weeks * focusDays * phaseExercises.length;
  if (denom <= 0) return 0;

  const required = new Map(phaseExercises.map(e => [e.id, e.sets ?? 1]));

  // Each rollup row already is one (exercise, date) with its set count.
  const rows = await db.select({
    exercise_id: logDayCounts.exercise_id,
    sets: logDayCounts.sets,
  })
    .from(logDayCounts)
    .innerJoin(exercises, eq(logDayCounts.exercise_id, exercises.id))
    .where(and(eq(logDayCounts.user_id, userId), eq(exercises.phase_id, phase.id), gt(logDayCounts.sets, 0)));

  let done = 0;
  for (const r of rows) {
    const req = required.get(r.exercise_id) ?? 1;
    done += Math.min(r.sets / req, 1);
  }

  return Math.min(100, Math.round((done / denom) * 100));
}

export async function getSessionDates(db: DrizzleDb, userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ session_date: logDayCounts.session_date })
    .from(logDayCounts)
    .where(and(eq(logDayCounts.user_id, userId), gt(logDayCounts.sets, 0)));
  return rows.map(r => r.session_date);
}

export async function getSessionDatesByInjury(
  db: DrizzleDb,
  userId: string,
): Promise<Map<string, Set<string>>> {
  const rows = await db
    .selectDistinct({
      session_date: logDayCounts.session_date,
      injury_id: phases.injury_id,
    })
    .from(logDayCounts)
    .innerJoin(exercises, eq(logDayCounts.exercise_id, exercises.id))
    .innerJoin(phases, eq(exercises.phase_id, phases.id))
    .where(and(eq(logDayCounts.user_id, userId), gt(logDayCounts.sets, 0)));

  const result = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!result.has(row.injury_id)) result.set(row.injury_id, new Set());
    result.get(row.injury_id)!.add(row.session_date);
  }
  return result;
}

export interface DaySession {
  injury_id: string;
  phase_num: number;
}

export async function getSessionPhasesByDate(
  db: DrizzleDb,
  userId: string,
): Promise<Map<string, DaySession[]>> {
  const rows = await db
    .selectDistinct({
      session_date: logDayCounts.session_date,
      injury_id: phases.injury_id,
      phase_num: phases.phase_num,
    })
    .from(logDayCounts)
    .innerJoin(exercises, eq(logDayCounts.exercise_id, exercises.id))
    .innerJoin(phases, eq(exercises.phase_id, phases.id))
    .where(and(eq(logDayCounts.user_id, userId), gt(logDayCounts.sets, 0)));

  const result = new Map<string, DaySession[]>();
  for (const row of rows) {
    if (!result.has(row.session_date)) result.set(row.session_date, []);
    result.get(row.session_date)!.push({ injury_id: row.injury_id, phase_num: row.phase_num });
  }
  return result;
}

// Recompute the rollup for one (exercise, day) from local raw logs and upsert it.
// Optimistic: keeps progress/gating correct immediately; the next pull overwrites
// this with the server's authoritative count (idempotent). Raw for the edited day
// is always present locally (current edits are within the sync window).
// Single statement (subquery recount) so it can ride the same execBatch as the
// log write it reacts to — sequential statements in one transaction.
export function refreshDayCountStatement(
  userId: string, exerciseId: string, sessionDate: string,
): SqlStatement {
  return {
    sql: `INSERT INTO log_day_counts (user_id, exercise_id, session_date, sets)
          VALUES (?, ?, ?,
            (SELECT COUNT(*) FROM exercise_logs
             WHERE user_id = ? AND exercise_id = ? AND session_date = ? AND deleted_at IS NULL
               AND set_type != 'warmup'))
          ON CONFLICT(user_id, exercise_id, session_date) DO UPDATE SET sets = excluded.sets`,
    bind: [userId, exerciseId, sessionDate, userId, exerciseId, sessionDate],
  };
}

// Soft delete a deselected set: keep the row, set deleted_at; the repo enqueues the
// snapshot. Statements so write + day-count refresh + queue entry commit atomically.
export function softDeleteExerciseLogStatements(
  id: string, deletedAt: number,
  row: { user_id: string; exercise_id: string; session_date: string },
): SqlStatement[] {
  return [
    { sql: `UPDATE exercise_logs SET deleted_at = ?, synced = 1 WHERE id = ?`, bind: [deletedAt, id] },
    refreshDayCountStatement(row.user_id, row.exercise_id, row.session_date),
  ];
}

// Upsert an exercise edit locally; the repo enqueues it for push (queue-XOR-synced).
export function saveExerciseStatements(ex: ExerciseInput): SqlStatement[] {
  return [{
    sql: `INSERT INTO exercises (id, phase_id, name, detail, sets, reps, duration_s, exercise_type, sort_order, video_url, warmup_sets, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          ON CONFLICT(id) DO UPDATE SET
            phase_id = excluded.phase_id, name = excluded.name, detail = excluded.detail,
            sets = excluded.sets, reps = excluded.reps, duration_s = excluded.duration_s,
            exercise_type = excluded.exercise_type, sort_order = excluded.sort_order,
            video_url = excluded.video_url, warmup_sets = excluded.warmup_sets, synced = 1`,
    bind: [ex.id, ex.phase_id, ex.name, ex.detail, ex.sets, ex.reps, ex.duration_s,
           ex.exercise_type, ex.sort_order, ex.video_url, ex.warmup_sets],
  }];
}

// deleted_at: NULL on insert/update reactivates a previously soft-deleted set.
export function saveExerciseLogStatements(log: NewExerciseLog): SqlStatement[] {
  return [
    {
      sql: `INSERT INTO exercise_logs (id, user_id, exercise_id, session_date, reps_done, pain_during, rpe, note, set_type, completed_at, deleted_at, synced)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)
            ON CONFLICT(id) DO UPDATE SET
              reps_done = excluded.reps_done, pain_during = excluded.pain_during, rpe = excluded.rpe,
              note = excluded.note, set_type = excluded.set_type, completed_at = excluded.completed_at, deleted_at = NULL, synced = 1`,
      bind: [log.id, log.user_id, log.exercise_id, log.session_date, log.reps_done ?? null,
             log.pain_during ?? null, log.rpe ?? null, log.note ?? null, log.set_type ?? "normal", log.completed_at ?? null],
    },
    refreshDayCountStatement(log.user_id, log.exercise_id, log.session_date),
  ];
}
