// Feature hook for the phase-journey flow. Owns data access + the criteria toggle
// behind repositories, keeping the screen render-only. Mirrors the existing reload
// pattern (re-run on mount and on sync) and fire-and-forget push after a mutation.
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../auth/AuthContext";
import { useSync } from "../hooks/useSync";
import {
  injuryRepository,
  exerciseRepository,
  effectiveFocusDays,
  type Phase,
  type Injury,
  type PhaseCriteria,
  type Exercise,
  type DaySession,
} from "../../data/repositories";

export interface PhaseJourneyData {
  phase: Phase;
  criteria: PhaseCriteria[];
  progressPct: number;
  injury: Injury | undefined;
  nextPhase: Phase | undefined;
  exercises: Exercise[];
  doneIds: Set<string>;
  sessionsByDate: Map<string, DaySession[]>;
}

export function usePhaseJourney(phaseId: string | undefined): {
  data: PhaseJourneyData | null;
  reload: () => Promise<void>;
  toggleCriteria: (criteriaId: string, current: boolean) => Promise<void>;
} {
  const { user } = useAuth();
  const { lastSyncAt } = useAuth();
  const push = useSync();
  const [data, setData] = useState<PhaseJourneyData | null>(null);

  const reload = useCallback(async () => {
    if (!phaseId) return;
    const phase = await injuryRepository.getPhaseById(phaseId);
    if (!phase) return;
    const criteria = await injuryRepository.getCriteria(phaseId);
    const injury = phase.injury_id ? (await injuryRepository.getInjuryById(phase.injury_id)) ?? undefined : undefined;
    const progressPct = user ? await exerciseRepository.getPhaseProgress(phase, effectiveFocusDays(phase, injury), user.id) : 0;
    const allPhases = await injuryRepository.getPhasesForInjury(phase.injury_id);
    const nextPhase = allPhases.find(p => p.phase_num === phase.phase_num + 1);
    const exercises = await exerciseRepository.getExercisesForPhase(phaseId);
    const today = new Date().toLocaleDateString("en-CA");
    const logs = user ? await exerciseRepository.getTodayLogs(user.id, today) : [];
    const doneIds = new Set(logs.map(l => l.exercise_id));
    const sessionsByDate = user ? await exerciseRepository.getSessionPhasesByDate(user.id) : new Map<string, DaySession[]>();
    setData({ phase, criteria, progressPct, injury, nextPhase, exercises, doneIds, sessionsByDate });
  }, [phaseId, user]);

  useEffect(() => {
    reload();
  }, [reload, lastSyncAt]);

  const toggleCriteria = useCallback(async (criteriaId: string, current: boolean) => {
    await injuryRepository.setCriteriaDone(criteriaId, !current);
    await reload();
    push();
  }, [reload, push]);

  return { data, reload, toggleCriteria };
}
