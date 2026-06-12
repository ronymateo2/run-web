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
  effectiveFocusDays,
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

export interface HomeStats {
  /** Mean pain across checkins of the last 7 days; null when no checkins. */
  painAvg7: number | null;
  /** painAvg7 minus the previous 7-day window; null when either window is empty. */
  painDelta: number | null;
  /** Per-checkin mean pain, chronological, last 14 days — sparkline source. */
  painSpark: number[];
  weekDone: number;
  weekPlanned: number;
  /** One flag per day, oldest first, ending today: trained that day? */
  weekDots: boolean[];
  totalSessions: number;
}

export interface TodayData {
  injuries: Injury[];
  focusBlocks: FocusBlock[];
  setsDone: Map<string, number>;
  checkin: PainCheckin | null;
  sstResult: SstResult | null;
  sstDue: boolean;
  promsDue: PromInstrument[];
  stats: HomeStats;
}

// "YYYY-MM-DD" + n days, DST-safe (anchored at UTC noon).
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Mean of the zones that hurt (>0); a checkin with no pain counts as 0.
function checkinAvg(checkin: PainCheckin): number {
  const vals = Object.values(checkin.zones).filter((v): v is number => (v ?? 0) > 0);
  return vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length;
}

function buildHomeStats(
  todayStr: string,
  checkins: PainCheckin[], // date-desc, as getRecentCheckins returns
  sessionDates: string[],
  weekPlanned: number,
): HomeStats {
  const since7 = addDays(todayStr, -6);
  const since14 = addDays(todayStr, -13);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const painAvg7 = mean(checkins.filter(c => c.date >= since7).map(checkinAvg));
  const prevAvg7 = mean(checkins.filter(c => c.date >= since14 && c.date < since7).map(checkinAvg));
  const painSpark = checkins.filter(c => c.date >= since14).map(checkinAvg).reverse();

  const trained = new Set(sessionDates);
  const weekDots = Array.from({ length: 7 }, (_, i) => trained.has(addDays(todayStr, i - 6)));

  return {
    painAvg7,
    painDelta: painAvg7 != null && prevAvg7 != null ? painAvg7 - prevAvg7 : null,
    painSpark,
    weekDone: weekDots.filter(Boolean).length,
    weekPlanned,
    weekDots,
    totalSessions: trained.size,
  };
}

// Planned training days per week = union of every active injury's effective focus
// days (current phase's override wins over the injury's own).
async function plannedDaysPerWeek(injuries: Injury[]): Promise<number> {
  const days = new Set<string>();
  for (const inj of injuries) {
    const phase = await injuryRepository.getCurrentPhase(inj);
    const fd = effectiveFocusDays(phase, inj);
    if (!fd) continue;
    try { for (const d of JSON.parse(fd) as string[]) days.add(d); }
    catch { /* malformed focus_days → skip */ }
  }
  return days.size;
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
      const recentCheckins = await checkinRepository.getRecentCheckins(user.id, 30);
      const sessionDates = await exerciseRepository.getSessionDates(user.id);
      const weekPlanned = await plannedDaysPerWeek(injuries);
      const stats = buildHomeStats(dateStr, recentCheckins, sessionDates, weekPlanned);
      setData({ injuries, focusBlocks, setsDone: setsDoneMap(logs), checkin, sstResult, sstDue, promsDue, stats });
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
