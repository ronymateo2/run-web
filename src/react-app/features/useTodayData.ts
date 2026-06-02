// Feature hook for the Today/Home flow. Owns all data access behind repositories so
// the screen renders only. Keeps the existing reload pattern: re-runs on mount and
// whenever a sync lands (lastSyncAt).
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../auth/AuthContext";
import { localToday } from "../utils/timezone";
import { setsDoneMap } from "../components/ExerciseList";
import {
  injuryRepository,
  exerciseRepository,
  checkinRepository,
  sstRepository,
  isSstPreferredToday,
  type Injury,
  type Phase,
  type Exercise,
  type PainCheckin,
  type SstResult,
} from "../../data/repositories";

export interface FocusBlock {
  injury: Injury;
  phase: Phase | null;
  exercises: Exercise[];
}

export interface TodayData {
  injuries: Injury[];
  focusBlocks: FocusBlock[];
  setsDone: Map<string, number>;
  checkin: PainCheckin | null;
  sstResult: SstResult | null;
  sstDue: boolean;
}

export function useTodayData(): {
  data: TodayData | null;
  loading: boolean;
  error: unknown;
  reload: () => Promise<void>;
} {
  const { user, lastSyncAt } = useAuth();
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const dateStr = localToday(user.timezone);
      const injuries = await injuryRepository.getActiveInjuries(user.id);
      const focusInjuries = await injuryRepository.getTodayFocusInjuries(injuries, user.timezone);
      const focusBlocks: FocusBlock[] = await Promise.all(
        focusInjuries.map(async (injury) => {
          const phase = await injuryRepository.getCurrentPhase(injury);
          const exercises = phase ? await exerciseRepository.getExercisesForPhase(phase.id) : [];
          return { injury, phase, exercises };
        })
      );
      const logs = await exerciseRepository.getTodayLogs(user.id, dateStr);
      const checkin = await checkinRepository.getTodayCheckin(user.id, dateStr);
      const sstResult = await sstRepository.getTodaySst(user.id, dateStr);
      const sstDue = isSstPreferredToday(user.timezone);
      setData({ injuries, focusBlocks, setsDone: setsDoneMap(logs), checkin, sstResult, sstDue });
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload, lastSyncAt]);

  return { data, loading, error, reload };
}
