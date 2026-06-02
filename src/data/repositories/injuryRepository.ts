// Injury/phase/criteria data boundary. Screens and feature hooks call this repo;
// it resolves the Drizzle instance internally so the UI never touches useDb/SQL.
import { getDrizzle } from "../../db/drizzle";
import * as q from "../../db/queries/injuries";

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

  // --- Writes (mark synced=0; caller triggers push()). ---
  async updateInjuryEdit(injuryId: string, currentPhaseId: string | null, focusDays: string[]): Promise<void> {
    return q.updateInjuryEdit(injuryId, currentPhaseId, focusDays);
  },
  async savePhase(p: PhaseInput): Promise<void> {
    return q.savePhase(p);
  },
  async softDeletePhase(phaseId: string): Promise<void> {
    return q.softDeletePhase(phaseId);
  },
  async saveCriteria(c: { id: string; phase_id: string; description: string }): Promise<void> {
    return q.saveCriteria(c);
  },
  async softDeleteCriteria(id: string): Promise<void> {
    return q.softDeleteCriteria(id);
  },
  async setCriteriaDone(id: string, done: boolean): Promise<void> {
    return q.setCriteriaDone(id, done);
  },
};
