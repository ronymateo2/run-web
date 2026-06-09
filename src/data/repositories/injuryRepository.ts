// Injury/phase/criteria data boundary. Screens and feature hooks call this repo;
// it resolves the Drizzle instance internally so the UI never touches useDb/SQL.
import { getDrizzle } from "../../db/drizzle";
import * as q from "../../db/queries/injuries";
import { enqueueMutation, enqueueRowSnapshot } from "../sync";

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

  // --- Writes (outbox pattern: local write + sync_queue entry; caller triggers push()). ---
  async updateInjuryEdit(injuryId: string, currentPhaseId: string | null, focusDays: string[]): Promise<void> {
    await q.updateInjuryEdit(injuryId, currentPhaseId, focusDays);
    // Server only accepts current_phase_id + focus_days (zod strips the rest of the row).
    await enqueueRowSnapshot("injury", "injuries", injuryId);
  },
  async savePhase(p: PhaseInput): Promise<void> {
    await q.savePhase(p);
    await enqueueRowSnapshot("phase", "phases", p.id);
  },
  async softDeletePhase(phaseId: string): Promise<void> {
    // Cascade: the phase and every criterion under it get deleted_at; sync all of them.
    const criteriaIds = await q.softDeletePhase(phaseId);
    await enqueueRowSnapshot("phase", "phases", phaseId);
    for (const id of criteriaIds) await enqueueRowSnapshot("phase_criterion", "phase_criteria", id);
  },
  async saveCriteria(c: { id: string; phase_id: string; description: string }): Promise<void> {
    await q.saveCriteria(c);
    await enqueueRowSnapshot("phase_criterion", "phase_criteria", c.id);
  },
  async softDeleteCriteria(id: string): Promise<void> {
    await q.softDeleteCriteria(id);
    await enqueueRowSnapshot("phase_criterion", "phase_criteria", id);
  },
  async setCriteriaDone(id: string, done: boolean): Promise<void> {
    await q.setCriteriaDone(id, done);
    // Separate channel from the criterion row: done is per-user state
    // (user_criteria_done server-side), not plan content.
    await enqueueMutation({
      entity: "criteria_done",
      entityId: id,
      operation: "upsert",
      payload: { criteria_id: id, done },
    });
  },
};
