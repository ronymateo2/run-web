// Injury/phase/criteria data boundary. Screens and feature hooks call this repo;
// it resolves the Drizzle instance internally so the UI never touches useDb/SQL.
import { getDrizzle } from "../../db/drizzle";
import { execBatch, queryAll } from "../../db/client";
import * as q from "../../db/queries/injuries";
import { buildQueueStatements, readRowSnapshot } from "../sync";

export type Injury = q.Injury;
export type Phase = q.Phase;
export type PhaseCriteria = q.PhaseCriteria;
export type PhaseInput = q.PhaseInput;

// Pure helpers (no I/O) re-exported so callers don't reach into queries/*.
export const computePhaseProgress = q.computePhaseProgress;
export const effectiveFocusDays = q.effectiveFocusDays;

export const injuryRepository = {
  async getActiveInjuries(userId: string): Promise<Injury[]> {
    return q.getActiveInjuries(await getDrizzle(), userId);
  },
  async getInjuryById(id: string): Promise<Injury | null> {
    return q.getInjuryById(await getDrizzle(), id);
  },
  async getPhaseById(id: string): Promise<Phase | null> {
    return q.getPhaseById(await getDrizzle(), id);
  },
  async getPhasesForInjury(injuryId: string): Promise<Phase[]> {
    return q.getPhasesForInjury(await getDrizzle(), injuryId);
  },
  async getPhasesForInjuries(injuryIds: string[]): Promise<Phase[]> {
    return q.getPhasesForInjuries(await getDrizzle(), injuryIds);
  },
  async getCurrentPhase(injury: Injury): Promise<Phase | null> {
    return q.getCurrentPhase(await getDrizzle(), injury);
  },
  async getCriteria(phaseId: string): Promise<PhaseCriteria[]> {
    return q.getCriteria(await getDrizzle(), phaseId);
  },
  async getTodayFocusInjuries(injuries: Injury[], tz?: string | null): Promise<Injury[]> {
    return q.getTodayFocusInjuries(await getDrizzle(), injuries, tz);
  },
  async getTodayFocusInjury(injuries: Injury[], tz?: string | null): Promise<Injury | null> {
    return q.getTodayFocusInjury(await getDrizzle(), injuries, tz);
  },

  // --- Writes (outbox pattern). Local write + sync_queue entry commit in ONE
  // execBatch (atomic); caller triggers push(). ---
  async updateInjuryEdit(injuryId: string, currentPhaseId: string | null, focusDays: string[]): Promise<void> {
    const focus = focusDays.length ? JSON.stringify(focusDays) : null;
    // Server only accepts current_phase_id + focus_days.
    await execBatch([
      ...q.updateInjuryEditStatements(injuryId, currentPhaseId, focus),
      ...buildQueueStatements({
        entity: "injury", entityId: injuryId, operation: "upsert",
        payload: { id: injuryId, current_phase_id: currentPhaseId, focus_days: focus },
      }),
    ]);
  },
  async savePhase(p: PhaseInput): Promise<void> {
    await execBatch([
      ...q.savePhaseStatements(p),
      ...buildQueueStatements({ entity: "phase", entityId: p.id, operation: "upsert", payload: { ...p, deleted_at: null } }),
    ]);
  },
  async softDeletePhase(phaseId: string): Promise<void> {
    // Cascade: the phase and every criterion under it get deleted_at; sync all of them.
    // Snapshots are read first so every queue payload (full rows, required by the
    // server schema) rides the same batch as the local soft deletes.
    const phase = await readRowSnapshot("phases", phaseId);
    if (!phase) return;
    const now = Date.now();
    const criteria = await queryAll<{ id: string; phase_id: string; description: string }>(
      `SELECT id, phase_id, description FROM phase_criteria WHERE phase_id = ?`, [phaseId],
    );
    await execBatch([
      ...q.softDeletePhaseStatements(phaseId, now),
      ...buildQueueStatements({
        entity: "phase", entityId: phaseId, operation: "upsert",
        payload: { ...phase, deleted_at: now },
      }),
      ...criteria.flatMap((c) =>
        buildQueueStatements({
          entity: "phase_criterion", entityId: c.id, operation: "upsert",
          payload: { id: c.id, phase_id: c.phase_id, description: c.description, deleted_at: now },
        }),
      ),
    ]);
  },
  async saveCriteria(c: { id: string; phase_id: string; description: string }): Promise<void> {
    await execBatch([
      ...q.saveCriteriaStatements(c),
      ...buildQueueStatements({
        entity: "phase_criterion", entityId: c.id, operation: "upsert",
        payload: { id: c.id, phase_id: c.phase_id, description: c.description, deleted_at: null },
      }),
    ]);
  },
  async softDeleteCriteria(id: string): Promise<void> {
    const row = await readRowSnapshot("phase_criteria", id);
    if (!row) return;
    const now = Date.now();
    await execBatch([
      ...q.softDeleteCriteriaStatements(id, now),
      ...buildQueueStatements({
        entity: "phase_criterion", entityId: id, operation: "upsert",
        payload: { id, phase_id: row.phase_id, description: row.description, deleted_at: now },
      }),
    ]);
  },
  async setCriteriaDone(id: string, done: boolean): Promise<void> {
    // Separate channel from the criterion row: done is per-user state
    // (user_criteria_done server-side), not plan content.
    await execBatch([
      ...q.setCriteriaDoneStatements(id, done),
      ...buildQueueStatements({
        entity: "criteria_done", entityId: id, operation: "upsert",
        payload: { criteria_id: id, done },
      }),
    ]);
  },
};
