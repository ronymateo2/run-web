import { queryAll, queryOne, exec, type Database } from "../client";

export interface Exercise {
  id: string; phase_id: string; name: string; detail?: string;
  sets?: number; reps?: number; duration_s?: number;
  exercise_type: "isometric" | "strength" | "mobility" | "cardio";
  sort_order: number;
}

export interface ExerciseLog {
  id: string; user_id: string; exercise_id: string; session_date: string;
  reps_done?: number; pain_during?: number; rpe?: number;
  note?: string; completed_at?: number;
}

export async function getExercisesForPhase(db: Database, phaseId: string): Promise<Exercise[]> {
  return queryAll<Exercise>(db, `SELECT * FROM exercises WHERE phase_id = ? ORDER BY sort_order`, [phaseId]);
}

export async function getExerciseById(db: Database, id: string): Promise<Exercise | null> {
  return queryOne<Exercise>(db, `SELECT * FROM exercises WHERE id = ?`, [id]);
}

export async function getTodayLogs(db: Database, userId: string, date: string): Promise<ExerciseLog[]> {
  return queryAll<ExerciseLog>(
    db, `SELECT * FROM exercise_logs WHERE user_id = ? AND session_date = ?`, [userId, date]
  );
}

export async function getLogsForExercise(
  db: Database, userId: string, exerciseId: string, date: string
): Promise<ExerciseLog[]> {
  return queryAll<ExerciseLog>(
    db,
    `SELECT * FROM exercise_logs WHERE user_id = ? AND exercise_id = ? AND session_date = ? ORDER BY completed_at`,
    [userId, exerciseId, date]
  );
}

export async function saveExerciseLog(db: Database, log: ExerciseLog): Promise<void> {
  await exec(db, `
    INSERT INTO exercise_logs
      (id, user_id, exercise_id, session_date, reps_done, pain_during, rpe, note, completed_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(id) DO UPDATE SET
      reps_done = excluded.reps_done, pain_during = excluded.pain_during,
      rpe = excluded.rpe, note = excluded.note, completed_at = excluded.completed_at
  `, [log.id, log.user_id, log.exercise_id, log.session_date,
      log.reps_done ?? null, log.pain_during ?? null, log.rpe ?? null,
      log.note ?? null, log.completed_at ?? null]);
}
