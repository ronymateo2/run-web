import { queryAll, queryOne, type Database } from "../client";

export interface Injury {
  id: string; user_id: string; name: string; zone: string;
  status: "active" | "paused" | "completed"; current_phase_id?: string;
  focus_days?: string; started_at?: number;
}

export interface Phase {
  id: string; injury_id: string; phase_num: number; name: string;
  description?: string; week_start: number; week_end: number; threshold_pct: number;
}

export interface PhaseCriteria {
  id: string; phase_id: string; description: string; done: boolean;
}

export async function getActiveInjuries(db: Database, userId: string): Promise<Injury[]> {
  return queryAll<Injury>(
    db, `SELECT * FROM injuries WHERE user_id = ? AND status = 'active' ORDER BY started_at`, [userId]
  );
}

export async function getInjuryById(db: Database, id: string): Promise<Injury | null> {
  return queryOne<Injury>(db, `SELECT * FROM injuries WHERE id = ?`, [id]);
}

export async function getPhasesForInjury(db: Database, injuryId: string): Promise<Phase[]> {
  return queryAll<Phase>(db, `SELECT * FROM phases WHERE injury_id = ? ORDER BY phase_num`, [injuryId]);
}

export async function getCurrentPhase(db: Database, injury: Injury): Promise<Phase | null> {
  if (!injury.current_phase_id) return null;
  return queryOne<Phase>(db, `SELECT * FROM phases WHERE id = ?`, [injury.current_phase_id]);
}

export async function getCriteria(db: Database, phaseId: string): Promise<PhaseCriteria[]> {
  const rows = await queryAll<{ id: string; phase_id: string; description: string; done: number }>(
    db, `SELECT * FROM phase_criteria WHERE phase_id = ?`, [phaseId]
  );
  return rows.map(r => ({ ...r, done: Boolean(r.done) }));
}

export function computePhaseProgress(criteria: PhaseCriteria[]): number {
  if (criteria.length === 0) return 0;
  return Math.round((criteria.filter(c => c.done).length / criteria.length) * 100);
}

export function getTodayFocusInjuries(injuries: Injury[], tz?: string | null): Injury[] {
  const zone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dow = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: zone })
    .format(new Date()).toLowerCase();
  const focused = injuries.filter(inj => {
    if (!inj.focus_days) return false;
    try { return (JSON.parse(inj.focus_days) as string[]).includes(dow); }
    catch { return false; }
  });
  return focused.length > 0 ? focused : injuries.slice(0, 1);
}

export function getTodayFocusInjury(injuries: Injury[]): Injury | null {
  return getTodayFocusInjuries(injuries)[0] ?? null;
}
