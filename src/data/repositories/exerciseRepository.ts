// Exercise/log data boundary. Resolves Drizzle internally; UI never touches useDb/SQL.
import { getDrizzle } from "../../db/drizzle";
import * as q from "../../db/queries/exercises";
import { enqueueRowSnapshot } from "../sync";

export type Exercise = q.Exercise;
export type ExerciseLog = q.ExerciseLog;
export type NewExerciseLog = q.NewExerciseLog;
export type ExerciseInput = q.ExerciseInput;
export type DaySession = q.DaySession;

export const exerciseRepository = {
  async getExercisesForPhase(phaseId: string): Promise<Exercise[]> {
    return q.getExercisesForPhase(await getDrizzle(), phaseId);
  },
  async getExerciseById(id: string): Promise<Exercise | null> {
    return q.getExerciseById(await getDrizzle(), id);
  },
  async getTodayLogs(userId: string, date: string): Promise<ExerciseLog[]> {
    return q.getTodayLogs(await getDrizzle(), userId, date);
  },
  async getLogsForExercise(userId: string, exerciseId: string, date: string): Promise<ExerciseLog[]> {
    return q.getLogsForExercise(await getDrizzle(), userId, exerciseId, date);
  },
  async getAllLogsForExercise(userId: string, exerciseId: string): Promise<ExerciseLog[]> {
    return q.getAllLogsForExercise(await getDrizzle(), userId, exerciseId);
  },
  async getLastSessionForExercise(
    userId: string, exerciseId: string, beforeDate: string,
  ): Promise<{ date: string; logs: ExerciseLog[] } | null> {
    return q.getLastSessionForExercise(await getDrizzle(), userId, exerciseId, beforeDate);
  },
  async getPhaseExerciseProgress(phaseId: string, userId: string): Promise<number> {
    return q.getPhaseExerciseProgress(await getDrizzle(), phaseId, userId);
  },
  async getPhaseProgress(
    phase: { id: string; week_start: number; week_end: number },
    focusDaysJson: string | null | undefined,
    userId: string,
  ): Promise<number> {
    return q.getPhaseProgress(await getDrizzle(), phase, focusDaysJson, userId);
  },
  async getSessionDates(userId: string): Promise<string[]> {
    return q.getSessionDates(await getDrizzle(), userId);
  },
  async getSessionDatesByInjury(userId: string): Promise<Map<string, Set<string>>> {
    return q.getSessionDatesByInjury(await getDrizzle(), userId);
  },
  async getSessionPhasesByDate(userId: string): Promise<Map<string, DaySession[]>> {
    return q.getSessionPhasesByDate(await getDrizzle(), userId);
  },

  // --- Writes (outbox pattern: local write + sync_queue snapshot; caller triggers push()). ---
  async softDeleteExerciseLog(id: string): Promise<void> {
    await q.softDeleteExerciseLog(await getDrizzle(), id);
    await enqueueRowSnapshot("exercise_log", "exercise_logs", id); // no-op if row never existed
  },
  async saveExercise(ex: ExerciseInput): Promise<void> {
    await q.saveExercise(await getDrizzle(), ex);
    await enqueueRowSnapshot("exercise", "exercises", ex.id);
  },
  async saveExerciseLog(log: NewExerciseLog): Promise<void> {
    await q.saveExerciseLog(await getDrizzle(), log);
    await enqueueRowSnapshot("exercise_log", "exercise_logs", log.id);
  },
};
