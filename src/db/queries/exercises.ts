import { eq, and } from "drizzle-orm";
import { exercises, exerciseLogs, phases } from "../schema";
import type { DrizzleDb } from "../drizzle";

export type Exercise = typeof exercises.$inferSelect;
export type ExerciseLog = typeof exerciseLogs.$inferSelect;
export type NewExerciseLog = Omit<typeof exerciseLogs.$inferInsert, "synced">;

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
    .where(and(eq(exerciseLogs.user_id, userId), eq(exerciseLogs.session_date, date)));
}

export async function getLogsForExercise(
  db: DrizzleDb, userId: string, exerciseId: string, date: string
): Promise<ExerciseLog[]> {
  return db.select().from(exerciseLogs)
    .where(and(
      eq(exerciseLogs.user_id, userId),
      eq(exerciseLogs.exercise_id, exerciseId),
      eq(exerciseLogs.session_date, date),
    ))
    .orderBy(exerciseLogs.completed_at);
}

export async function getPhaseExerciseProgress(
  db: DrizzleDb, phaseId: string, userId: string
): Promise<number> {
  const allExercises = await db.select({ id: exercises.id, sets: exercises.sets })
    .from(exercises)
    .where(eq(exercises.phase_id, phaseId));
  if (allExercises.length === 0) return 0;

  const ids = allExercises.map(e => e.id);
  const logs = await db.select({
    exercise_id: exerciseLogs.exercise_id,
    session_date: exerciseLogs.session_date,
  })
    .from(exerciseLogs)
    .where(and(
      eq(exerciseLogs.user_id, userId),
    ));

  // group logs by exercise_id → session_date → count
  const logMap = new Map<string, Map<string, number>>();
  for (const log of logs) {
    if (!ids.includes(log.exercise_id)) continue;
    let byDate = logMap.get(log.exercise_id);
    if (!byDate) { byDate = new Map(); logMap.set(log.exercise_id, byDate); }
    byDate.set(log.session_date, (byDate.get(log.session_date) ?? 0) + 1);
  }

  // exercise is done if any session_date has count >= sets (null sets = 1)
  let done = 0;
  for (const ex of allExercises) {
    const required = ex.sets ?? 1;
    const byDate = logMap.get(ex.id);
    if (byDate && [...byDate.values()].some(count => count >= required)) done++;
  }

  return Math.round((done / allExercises.length) * 100);
}

export async function getSessionDates(db: DrizzleDb, userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ session_date: exerciseLogs.session_date })
    .from(exerciseLogs)
    .where(eq(exerciseLogs.user_id, userId));
  return rows.map(r => r.session_date);
}

export async function getSessionDatesByInjury(
  db: DrizzleDb,
  userId: string,
): Promise<Map<string, Set<string>>> {
  const rows = await db
    .selectDistinct({
      session_date: exerciseLogs.session_date,
      injury_id: phases.injury_id,
    })
    .from(exerciseLogs)
    .innerJoin(exercises, eq(exerciseLogs.exercise_id, exercises.id))
    .innerJoin(phases, eq(exercises.phase_id, phases.id))
    .where(eq(exerciseLogs.user_id, userId));

  const result = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!result.has(row.injury_id)) result.set(row.injury_id, new Set());
    result.get(row.injury_id)!.add(row.session_date);
  }
  return result;
}

export async function saveExerciseLog(db: DrizzleDb, log: NewExerciseLog): Promise<void> {
  await db.insert(exerciseLogs)
    .values({ ...log, synced: 0 })
    .onConflictDoUpdate({
      target: exerciseLogs.id,
      set: {
        reps_done: log.reps_done,
        pain_during: log.pain_during,
        rpe: log.rpe,
        note: log.note,
        completed_at: log.completed_at,
      },
    });
}
