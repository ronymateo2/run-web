import { eq, and, desc, isNull } from "drizzle-orm";
import { promInstruments, promResults } from "../schema";
import type { DrizzleDb } from "../drizzle";
import type { SqlStatement } from "../client";

export interface PromQuestion { id: string; text: string; }

// Parsed instrument row (questions/zones decoded from JSON, 0/1 ints as booleans).
export interface PromInstrument {
  id: string;
  name: string;
  zones: string[];
  questions: PromQuestion[];
  max_per_item: number;
  invert: boolean;
  better_is_higher: boolean;
  every_days: number;
  sort_order: number;
}

export type PromResult = typeof promResults.$inferSelect;
export type NewPromResult = Omit<typeof promResults.$inferInsert, "synced">;

type RawInstrument = typeof promInstruments.$inferSelect;

function parseInstrument(row: RawInstrument): PromInstrument {
  return {
    id: row.id,
    name: row.name,
    zones: JSON.parse(row.zones) as string[],
    questions: JSON.parse(row.questions) as PromQuestion[],
    max_per_item: row.max_per_item,
    invert: Boolean(row.invert),
    better_is_higher: Boolean(row.better_is_higher),
    every_days: row.every_days,
    sort_order: row.sort_order ?? 0,
  };
}

export async function getInstruments(db: DrizzleDb): Promise<PromInstrument[]> {
  const rows = await db.select().from(promInstruments).orderBy(promInstruments.sort_order);
  return rows.map(parseInstrument);
}

export async function getRecentProm(db: DrizzleDb, userId: string, limit = 30): Promise<PromResult[]> {
  return db.select().from(promResults)
    .where(and(eq(promResults.user_id, userId), isNull(promResults.deleted_at)))
    .orderBy(desc(promResults.date))
    .limit(limit);
}

export async function getRecentPromByInstrument(
  db: DrizzleDb, userId: string, instrumentId: string, limit = 12,
): Promise<PromResult[]> {
  return db.select().from(promResults)
    .where(and(eq(promResults.user_id, userId), eq(promResults.instrument_id, instrumentId), isNull(promResults.deleted_at)))
    .orderBy(desc(promResults.date))
    .limit(limit);
}

export async function getLastPromDate(db: DrizzleDb, userId: string, instrumentId: string): Promise<string | null> {
  const rows = await db.select({ date: promResults.date }).from(promResults)
    .where(and(eq(promResults.user_id, userId), eq(promResults.instrument_id, instrumentId), isNull(promResults.deleted_at)))
    .orderBy(desc(promResults.date))
    .limit(1);
  return rows[0]?.date ?? null;
}

// Statements so the repo can commit the write and its queue entry in ONE execBatch.
export function savePromResultStatements(result: NewPromResult): SqlStatement[] {
  return [{
    sql: `INSERT INTO prom_results (id, user_id, injury_id, instrument_id, date, score, answers, note, deleted_at, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)
          ON CONFLICT(id) DO UPDATE SET score = excluded.score, answers = excluded.answers, note = excluded.note, deleted_at = NULL, synced = 1`,
    bind: [result.id, result.user_id, result.injury_id, result.instrument_id, result.date,
           result.score ?? null, result.answers ?? null, result.note ?? null],
  }];
}

// --- Pure helpers (no I/O), re-exported by the repository. ---

// Normalise any instrument's answers to 0-100. `invert` flips the scale so that the
// stored score follows the instrument's native direction (SPADI high = worse;
// HAGOS high = better).
export function scoreInstrument(
  inst: Pick<PromInstrument, "questions" | "max_per_item" | "invert">,
  answers: Record<string, number>,
): number {
  const vals = inst.questions.map((q) => answers[q.id] ?? 0);
  const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  const normalized = (mean / inst.max_per_item) * 100;
  return Math.round((inst.invert ? 100 - normalized : normalized) * 10) / 10;
}

export function isPromDue(lastDate: string | null, everyDays: number, tz?: string | null): boolean {
  if (!lastDate) return true;
  const zone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: zone });
  const days = (Date.parse(today) - Date.parse(lastDate)) / 86400000;
  return days >= everyDays;
}

export function instrumentsForInjury(insts: PromInstrument[], zone: string): PromInstrument[] {
  const z = zone.toLowerCase();
  return insts.filter((i) => i.zones.some((k) => z.includes(k) || k.includes(z)));
}

// --- Interpretation (raw score → meaning), direction-aware. ---

// Minimal clinically important difference: a change ≥ this is real, not noise.
// Generic across SPADI (~10-13) and HAGOS (~10); kept simple at 10.
export const PROM_MCID = 10;

type Directional = Pick<PromInstrument, "better_is_higher">;

// 0-100 where higher = more problem, regardless of the instrument's native direction.
export function problemPct(inst: Directional, score: number): number {
  return inst.better_is_higher ? 100 - score : score;
}

export interface SeverityBand { label: string; tone: string; }
export function severityBand(inst: Directional, score: number): SeverityBand {
  const p = problemPct(inst, score);
  if (p <= 30) return { label: "leve", tone: "var(--moss)" };
  if (p <= 60) return { label: "moderado", tone: "var(--clay)" };
  return { label: "marcado", tone: "var(--clay-deep)" };
}

export interface PromTrend { delta: number | null; improving: boolean | null; mcid: boolean; }
export function promTrend(inst: Directional, current: number, prev: number | null): PromTrend {
  if (prev == null) return { delta: null, improving: null, mcid: false };
  const delta = Math.round((current - prev) * 10) / 10;
  const improving = inst.better_is_higher ? delta > 0 : delta < 0;
  return { delta, improving, mcid: Math.abs(delta) >= PROM_MCID };
}

export interface WorstItem { text: string; value: number; max: number; }
// Top items dragging the score down (highest raw answer = most limiting), from one completion.
export function worstItems(
  inst: Pick<PromInstrument, "questions" | "max_per_item">,
  answers: Record<string, number>, n = 3,
): WorstItem[] {
  return inst.questions
    .map((q) => ({ text: q.text, value: answers[q.id] ?? 0, max: inst.max_per_item }))
    .filter((it) => it.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}
