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
  promRepository,
  isSstPreferredToday,
  isPromDue,
  instrumentsForInjury,
  type Injury,
  type Phase,
  type Exercise,
  type PainCheckin,
  type SstResult,
  type PromInstrument,
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
  promsDue: PromInstrument[];
}

// Every instrument that applies to an active injury and whose cadence has elapsed.
// Returns all due (deduped) so the user can pick which to answer, not just the first.
async function findDuePromInstruments(
  injuries: Injury[], userId: string, tz?: string | null,
): Promise<PromInstrument[]> {
  const instruments = await promRepository.getInstruments();
  const due: PromInstrument[] = [];
  for (const inst of instruments) {
    const applies = injuries.some((inj) => instrumentsForInjury([inst], inj.zone).length > 0);
    if (!applies) continue;
    const last = await promRepository.getLastPromDate(userId, inst.id);
    if (isPromDue(last, inst.every_days, tz)) due.push(inst);
  }
  return due;
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
      const promsDue = await findDuePromInstruments(injuries, user.id, user.timezone);
      setData({ injuries, focusBlocks, setsDone: setsDoneMap(logs), checkin, sstResult, sstDue, promsDue });
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
