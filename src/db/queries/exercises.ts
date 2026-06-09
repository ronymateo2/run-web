import { eq, and, isNull, gt, lt, desc, count } from "drizzle-orm";
import { exercises, exerciseLogs, phases, logDayCounts } from "../schema";
import type { DrizzleDb } from "../drizzle";

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
async function refreshDayCount(
  db: DrizzleDb, userId: string, exerciseId: string, sessionDate: string
): Promise<void> {
  const rows = await db.select({ c: count() })
    .from(exerciseLogs)
    .where(and(
      eq(exerciseLogs.user_id, userId),
      eq(exerciseLogs.exercise_id, exerciseId),
      eq(exerciseLogs.session_date, sessionDate),
      notDeleted,
    ));
  const sets = rows[0]?.c ?? 0;
  await db.insert(logDayCounts)
    .values({ user_id: userId, exercise_id: exerciseId, session_date: sessionDate, sets })
    .onConflictDoUpdate({
      target: [logDayCounts.user_id, logDayCounts.exercise_id, logDayCounts.session_date],
      set: { sets },
    });
}

// Soft delete a deselected set: keep the row, set deleted_at; the repo enqueues the
// row so the flag propagates to D1. No-op if the row never existed (set was never saved).
export async function softDeleteExerciseLog(db: DrizzleDb, id: string): Promise<void> {
  await db.update(exerciseLogs)
    .set({ deleted_at: Date.now(), synced: 1 })
    .where(eq(exerciseLogs.id, id));
  const rows = await db.select({
    user_id: exerciseLogs.user_id,
    exercise_id: exerciseLogs.exercise_id,
    session_date: exerciseLogs.session_date,
  }).from(exerciseLogs).where(eq(exerciseLogs.id, id));
  const r = rows[0];
  if (r) await refreshDayCount(db, r.user_id, r.exercise_id, r.session_date);
}

// Upsert an exercise edit locally; the repo enqueues it for push (queue-XOR-synced).
export async function saveExercise(db: DrizzleDb, ex: ExerciseInput): Promise<void> {
  await db.insert(exercises)
    .values({ ...ex, synced: 1 })
    .onConflictDoUpdate({
      target: exercises.id,
      set: {
        phase_id: ex.phase_id,
        name: ex.name,
        detail: ex.detail,
        sets: ex.sets,
        reps: ex.reps,
        duration_s: ex.duration_s,
        exercise_type: ex.exercise_type,
        sort_order: ex.sort_order,
        video_url: ex.video_url,
        synced: 1,
      },
    });
}

export async function saveExerciseLog(db: DrizzleDb, log: NewExerciseLog): Promise<void> {
  // deleted_at: null on insert/update reactivates a previously soft-deleted set.
  await db.insert(exerciseLogs)
    .values({ ...log, deleted_at: null, synced: 1 })
    .onConflictDoUpdate({
      target: exerciseLogs.id,
      set: {
        reps_done: log.reps_done,
        pain_during: log.pain_during,
        rpe: log.rpe,
        note: log.note,
        completed_at: log.completed_at,
        deleted_at: null,
        synced: 1,
      },
    });
  await refreshDayCount(db, log.user_id, log.exercise_id, log.session_date);
}
