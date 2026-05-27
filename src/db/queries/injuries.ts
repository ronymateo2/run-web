import { eq, asc } from "drizzle-orm";
import { injuries, phases, phaseCriteria } from "../schema";
import type { DrizzleDb } from "../drizzle";

export type Injury = typeof injuries.$inferSelect;
export type Phase = typeof phases.$inferSelect;

export interface PhaseCriteria {
  id: string; phase_id: string; description: string; done: boolean;
}

export async function getActiveInjuries(db: DrizzleDb, userId: string): Promise<Injury[]> {
  return db.select().from(injuries)
    .where(eq(injuries.user_id, userId))
    .orderBy(asc(injuries.started_at));
}

export async function getInjuryById(db: DrizzleDb, id: string): Promise<Injury | null> {
  const rows = await db.select().from(injuries).where(eq(injuries.id, id));
  return rows[0] ?? null;
}

export async function getPhaseById(db: DrizzleDb, id: string): Promise<Phase | null> {
  const rows = await db.select().from(phases).where(eq(phases.id, id));
  return rows[0] ?? null;
}

export async function getPhasesForInjury(db: DrizzleDb, injuryId: string): Promise<Phase[]> {
  return db.select().from(phases)
    .where(eq(phases.injury_id, injuryId))
    .orderBy(asc(phases.phase_num));
}

export async function getCurrentPhase(db: DrizzleDb, injury: Injury): Promise<Phase | null> {
  if (!injury.current_phase_id) return null;
  const rows = await db.select().from(phases).where(eq(phases.id, injury.current_phase_id));
  return rows[0] ?? null;
}

export async function getCriteria(db: DrizzleDb, phaseId: string): Promise<PhaseCriteria[]> {
  const rows = await db.select().from(phaseCriteria).where(eq(phaseCriteria.phase_id, phaseId));
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
