// Feature hook for the phases-overview flow. Owns all data access behind the
// repositories so the screen renders only. Collapses the old N+1 RPC fan-out into
// a flat 5 round-trips: injuries, all phases (one IN-list), per-injury session
// dates, and bulk phase progress (two IN-list scans inside one repo call).
import { useState, useEffect } from "react";
import { useAuth } from "@features/auth/AuthContext";
import {
  injuryRepository,
  exerciseRepository,
  effectiveFocusDays,
  type Injury,
  type Phase,
} from "@data/repositories";

const MS_PER_WEEK = 7 * 24 * 3600 * 1000;

export interface PhaseWithProgress extends Phase {
  progressPct: number;
}

export interface InjuryData {
  injury: Injury;
  phases: PhaseWithProgress[];
  current: Phase | null;
  activityWeeks: Set<number>;
}

export function usePhasesOverviewData(): { data: InjuryData[] | null } {
  const { user, lastSyncAt } = useAuth();
  const [data, setData] = useState<InjuryData[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const injuries = await injuryRepository.getActiveInjuries(user.id);
      const allPhases = await injuryRepository.getPhasesForInjuries(injuries.map(i => i.id));
      const sessionsByInjury = await exerciseRepository.getSessionDatesByInjury(user.id);

      // Group phases per injury (already ordered by phase_num) and resolve each
      // phase's effective focus_days for the bulk progress query.
      const phasesByInjury = new Map<string, Phase[]>();
      const focusDaysByPhaseId = new Map<string, string | null | undefined>();
      for (const inj of injuries) phasesByInjury.set(inj.id, []);
      for (const p of allPhases) {
        const list = phasesByInjury.get(p.injury_id);
        if (!list) continue; // phase for an injury not in the active set — skip
        list.push(p);
        const inj = injuries.find(i => i.id === p.injury_id);
        focusDaysByPhaseId.set(p.id, effectiveFocusDays(p, inj));
      }

      const progressByPhaseId = await exerciseRepository.getPhaseProgressBulk(
        allPhases, focusDaysByPhaseId, user.id,
      );

      const result: InjuryData[] = injuries.map((inj) => {
        const phases = (phasesByInjury.get(inj.id) ?? []).map<PhaseWithProgress>(p => ({
          ...p, progressPct: progressByPhaseId.get(p.id) ?? 0,
        }));
        const current = phases.find(p => p.id === inj.current_phase_id) ?? null;
        const startedAt = inj.started_at ?? Date.now();
        const dates = sessionsByInjury.get(inj.id) ?? new Set<string>();
        const activityWeeks = new Set(
          [...dates].map(d => Math.max(1, Math.floor((new Date(d + "T00:00:00").getTime() - startedAt) / MS_PER_WEEK) + 1)),
        );
        return { injury: inj, phases, current, activityWeeks };
      });

      if (active) setData(result);
    })();
    return () => { active = false; };
  }, [user, lastSyncAt]);

  return { data };
}
