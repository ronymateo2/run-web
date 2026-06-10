import { eq, and, desc, isNull } from "drizzle-orm";
import { sstResults } from "../schema";
import type { DrizzleDb } from "../drizzle";
import type { SqlStatement } from "../client";

export type SstResult = typeof sstResults.$inferSelect;
export type NewSstResult = Omit<typeof sstResults.$inferInsert, "synced">;

export async function getRecentSst(db: DrizzleDb, userId: string, limit = 12): Promise<SstResult[]> {
  return db.select().from(sstResults)
    .where(and(eq(sstResults.user_id, userId), isNull(sstResults.deleted_at)))
    .orderBy(desc(sstResults.date))
    .limit(limit);
}

export async function getTodaySst(db: DrizzleDb, userId: string, date: string): Promise<SstResult | null> {
  const rows = await db.select().from(sstResults)
    .where(and(eq(sstResults.user_id, userId), eq(sstResults.date, date), isNull(sstResults.deleted_at)))
    .limit(1);
  return rows[0] ?? null;
}

// Statements so the repo can commit the write and its queue entry in ONE execBatch.
export function saveSstResultStatements(result: NewSstResult): SqlStatement[] {
  return [{
    sql: `INSERT INTO sst_results (id, user_id, injury_id, date, strength_score, pain_score, note, deleted_at, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1)
          ON CONFLICT(id) DO UPDATE SET strength_score = excluded.strength_score, pain_score = excluded.pain_score, note = excluded.note, deleted_at = NULL, synced = 1`,
    bind: [result.id, result.user_id, result.injury_id, result.date,
           result.strength_score ?? null, result.pain_score ?? null, result.note ?? null],
  }];
}

export function isSstPreferredToday(tz?: string | null, focusDays: string[] = ["tue", "thu"]): boolean {
  const zone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dow = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: zone })
    .format(new Date()).toLowerCase();
  return focusDays.includes(dow);
}
