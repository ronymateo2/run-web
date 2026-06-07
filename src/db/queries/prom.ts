import { eq, and, desc } from "drizzle-orm";
import { promInstruments, promResults } from "../schema";
import type { DrizzleDb } from "../drizzle";

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
    .where(eq(promResults.user_id, userId))
    .orderBy(desc(promResults.date))
    .limit(limit);
}

export async function getLastPromDate(db: DrizzleDb, userId: string, instrumentId: string): Promise<string | null> {
  const rows = await db.select({ date: promResults.date }).from(promResults)
    .where(and(eq(promResults.user_id, userId), eq(promResults.instrument_id, instrumentId)))
    .orderBy(desc(promResults.date))
    .limit(1);
  return rows[0]?.date ?? null;
}

export async function savePromResult(db: DrizzleDb, result: NewPromResult): Promise<void> {
  await db.insert(promResults)
    .values({ ...result, synced: 0 })
    .onConflictDoUpdate({
      target: promResults.id,
      set: { score: result.score, answers: result.answers, note: result.note, synced: 0 },
    });
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
