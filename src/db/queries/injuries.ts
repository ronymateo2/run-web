import { eq, asc, and, isNull } from "drizzle-orm";
import { injuries, phases, phaseCriteria } from "../schema";
import type { DrizzleDb } from "../drizzle";
import { exec, execBatch, queryAll } from "../client";

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
  const rows = await db.select().from(phases)
    .where(and(eq(phases.id, id), isNull(phases.deleted_at)));
  return rows[0] ?? null;
}

export async function getPhasesForInjury(db: DrizzleDb, injuryId: string): Promise<Phase[]> {
  return db.select().from(phases)
    .where(and(eq(phases.injury_id, injuryId), isNull(phases.deleted_at)))
    .orderBy(asc(phases.phase_num));
}

export async function getCurrentPhase(db: DrizzleDb, injury: Injury): Promise<Phase | null> {
  if (!injury.current_phase_id) return null;
  const rows = await db.select().from(phases)
    .where(and(eq(phases.id, injury.current_phase_id), isNull(phases.deleted_at)));
  return rows[0] ?? null;
}

export async function getCriteria(db: DrizzleDb, phaseId: string): Promise<PhaseCriteria[]> {
  const rows = await db.select().from(phaseCriteria)
    .where(and(eq(phaseCriteria.phase_id, phaseId), isNull(phaseCriteria.deleted_at)));
  return rows.map(r => ({ ...r, done: Boolean(r.done) }));
}

export function computePhaseProgress(criteria: PhaseCriteria[]): number {
  if (criteria.length === 0) return 0;
  return Math.round((criteria.filter(c => c.done).length / criteria.length) * 100);
}

// Phase frequency overrides injury frequency: a phase with its own focus_days wins;
// otherwise fall back to the injury's. Returns the JSON array string (or null).
export function effectiveFocusDays(
  phase: { focus_days?: string | null } | null | undefined,
  injury: { focus_days?: string | null } | null | undefined,
): string | null {
  return phase?.focus_days ?? injury?.focus_days ?? null;
}

function todayDow(tz?: string | null): string {
  const zone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: zone })
    .format(new Date()).toLowerCase();
}

// An injury is "today's focus" when today's weekday is in its effective focus_days —
// the current phase's own days if it has them, otherwise the injury's.
export async function getTodayFocusInjuries(
  db: DrizzleDb, injuries: Injury[], tz?: string | null,
): Promise<Injury[]> {
  const dow = todayDow(tz);
  const out: Injury[] = [];
  for (const inj of injuries) {
    const phase = await getCurrentPhase(db, inj);
    const fd = effectiveFocusDays(phase, inj);
    if (!fd) continue;
    try { if ((JSON.parse(fd) as string[]).includes(dow)) out.push(inj); }
    catch { /* malformed focus_days → skip */ }
  }
  return out;
}

export async function getTodayFocusInjury(
  db: DrizzleDb, injuries: Injury[], tz?: string | null,
): Promise<Injury | null> {
  return (await getTodayFocusInjuries(db, injuries, tz))[0] ?? null;
}

// --- Writes (synced=1: rows ship via sync_queue, the repo enqueues — guard
// queue-XOR-synced; caller triggers push()). Server enforces ownership. ---

export interface PhaseInput {
  id: string;
  injury_id: string;
  phase_num: number;
  name: string;
  description: string | null;
  week_start: number;
  week_end: number;
  threshold_pct: number;
  focus_days: string | null;
}

export async function updateInjuryEdit(
  injuryId: string, currentPhaseId: string | null, focusDays: string[],
): Promise<void> {
  const focus = focusDays.length ? JSON.stringify(focusDays) : null;
  await exec(
    `UPDATE injuries SET current_phase_id = ?, focus_days = ?, synced = 1 WHERE id = ?`,
    [currentPhaseId, focus, injuryId],
  );
}

export async function savePhase(p: PhaseInput): Promise<void> {
  await exec(
    `INSERT OR REPLACE INTO phases (id, injury_id, phase_num, name, description, week_start, week_end, threshold_pct, focus_days, deleted_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)`,
    [p.id, p.injury_id, p.phase_num, p.name, p.description, p.week_start, p.week_end, p.threshold_pct, p.focus_days],
  );
}

// Returns the affected criteria ids so the repo can enqueue each for sync.
export async function softDeletePhase(phaseId: string): Promise<string[]> {
  const now = Date.now();
  const criteria = await queryAll<{ id: string }>(`SELECT id FROM phase_criteria WHERE phase_id = ?`, [phaseId]);
  // Cascade: hide the phase and its criteria together.
  await execBatch([
    { sql: `UPDATE phases SET deleted_at = ?, synced = 1 WHERE id = ?`, bind: [now, phaseId] },
    { sql: `UPDATE phase_criteria SET deleted_at = ?, synced = 1 WHERE phase_id = ?`, bind: [now, phaseId] },
  ]);
  return criteria.map((r) => r.id);
}

export async function saveCriteria(c: { id: string; phase_id: string; description: string }): Promise<void> {
  // Preserve existing `done` on edit; default 0 on create. Never written by the sync channel.
  await exec(
    `INSERT OR REPLACE INTO phase_criteria (id, phase_id, description, done, deleted_at, synced)
     VALUES (?, ?, ?, COALESCE((SELECT done FROM phase_criteria WHERE id = ?), 0), NULL, 1)`,
    [c.id, c.phase_id, c.description, c.id],
  );
}

export async function softDeleteCriteria(id: string): Promise<void> {
  await exec(`UPDATE phase_criteria SET deleted_at = ?, synced = 1 WHERE id = ?`, [Date.now(), id]);
}

// Toggle a criterion's done flag locally; the repo enqueues a criteria_done mutation.
export async function setCriteriaDone(id: string, done: boolean): Promise<void> {
  await exec(`UPDATE phase_criteria SET done = ?, synced = 1 WHERE id = ?`, [done ? 1 : 0, id]);
}
