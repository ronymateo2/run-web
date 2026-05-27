import { eq, and, desc } from "drizzle-orm";
import { sstResults } from "../schema";
import type { DrizzleDb } from "../drizzle";

export type SstResult = typeof sstResults.$inferSelect;
export type NewSstResult = Omit<typeof sstResults.$inferInsert, "synced">;

export async function getRecentSst(db: DrizzleDb, userId: string, limit = 12): Promise<SstResult[]> {
  return db.select().from(sstResults)
    .where(eq(sstResults.user_id, userId))
    .orderBy(desc(sstResults.date))
    .limit(limit);
}

export async function getTodaySst(db: DrizzleDb, userId: string, date: string): Promise<SstResult | null> {
  const rows = await db.select().from(sstResults)
    .where(and(eq(sstResults.user_id, userId), eq(sstResults.date, date)))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveSstResult(db: DrizzleDb, result: NewSstResult): Promise<void> {
  await db.insert(sstResults)
    .values({ ...result, synced: 0 })
    .onConflictDoUpdate({
      target: sstResults.id,
      set: {
        strength_score: result.strength_score,
        pain_score: result.pain_score,
        note: result.note,
      },
    });
}

export function isSstPreferredToday(tz?: string | null, focusDays: string[] = ["tue", "thu"]): boolean {
  const zone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dow = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: zone })
    .format(new Date()).toLowerCase();
  return focusDays.includes(dow);
}
