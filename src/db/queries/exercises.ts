import { eq, and } from "drizzle-orm";
import { exercises, exerciseLogs } from "../schema";
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
