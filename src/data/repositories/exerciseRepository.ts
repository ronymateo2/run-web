// Exercise/log data boundary. Resolves Drizzle internally; UI never touches useDb/SQL.
import { getDrizzle } from "../../db/drizzle";
import { execBatch } from "../../db/client";
import * as q from "../../db/queries/exercises";
import { buildQueueStatements, readRowSnapshot } from "../sync";

export type Exercise = q.Exercise;
export type ExerciseLog = q.ExerciseLog;
export type NewExerciseLog = q.NewExerciseLog;
export type ExerciseInput = q.ExerciseInput;
export type DaySession = q.DaySession;
export type RepPhase = q.RepPhase;
// Pure helpers (no DB) re-exported so the UI derives guided phases without reaching into db/queries.
export const parseRepPhases = q.parseRepPhases;
export const guidedPhases = q.guidedPhases;

export const exerciseRepository = {
  async getExercisesForPhase(phaseId: string): Promise<Exercise[]> {
    return q.getExercisesForPhase(await getDrizzle(), phaseId);
  },
  async getArchivedExercisesForPhase(phaseId: string): Promise<Exercise[]> {
    return q.getArchivedExercisesForPhase(await getDrizzle(), phaseId);
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

  // --- Writes (outbox pattern). Local write + sync_queue entry commit in ONE
  // execBatch (atomic); caller triggers push(). ---
  async softDeleteExerciseLog(id: string): Promise<void> {
    const row = await readRowSnapshot("exercise_logs", id);
    if (!row) return; // soft-deleting a never-saved set is a no-op
    const now = Date.now();
    await execBatch([
      ...q.softDeleteExerciseLogStatements(id, now, row as { user_id: string; exercise_id: string; session_date: string }),
      ...buildQueueStatements({
        entity: "exercise_log", entityId: id, operation: "upsert",
        payload: { ...row, deleted_at: now },
      }),
    ]);
  },
  async saveExercise(ex: ExerciseInput): Promise<void> {
    await execBatch([
      ...q.saveExerciseStatements(ex),
      ...buildQueueStatements({ entity: "exercise", entityId: ex.id, operation: "upsert", payload: { ...ex } }),
    ]);
  },
  // Archive (hide from plan) or restore. Snapshot the row, override archived_at so the
  // pull-echo can't null it back (memory gotcha: every exercise column must be in the payload).
  async setExerciseArchived(id: string, archived: boolean): Promise<void> {
    const row = await readRowSnapshot("exercises", id);
    if (!row) return;
    const archivedAt = archived ? Date.now() : null;
    await execBatch([
      ...q.setExerciseArchivedStatements(id, archivedAt),
      ...buildQueueStatements({
        entity: "exercise", entityId: id, operation: "upsert",
        payload: { ...row, archived_at: archivedAt },
      }),
    ]);
  },
  // Persist a new order. orderedIds = active exercises in their new sequence (index =
  // sort_order). One atomic batch: all UPDATEs + one queue entry per exercise.
  async reorderExercises(orderedIds: string[], rowsById: Map<string, Exercise>): Promise<void> {
    await execBatch([
      ...q.reorderExercisesStatements(orderedIds),
      ...orderedIds.flatMap((id, i) => {
        const row = rowsById.get(id);
        return row
          ? buildQueueStatements({
              entity: "exercise", entityId: id, operation: "upsert",
              payload: { ...row, sort_order: i },
            })
          : [];
      }),
    ]);
  },
  async saveExerciseLog(log: NewExerciseLog): Promise<void> {
    await execBatch([
      ...q.saveExerciseLogStatements(log),
      ...buildQueueStatements({
        entity: "exercise_log", entityId: log.id, operation: "upsert",
        payload: {
          id: log.id, user_id: log.user_id, exercise_id: log.exercise_id,
          session_date: log.session_date, reps_done: log.reps_done ?? null,
          pain_during: log.pain_during ?? null, rpe: log.rpe ?? null,
          note: log.note ?? null, set_type: log.set_type ?? "normal",
          completed_at: log.completed_at ?? null,
          load: log.load ?? null, band: log.band ?? null, deleted_at: null,
        },
      }),
    ]);
  },
};
