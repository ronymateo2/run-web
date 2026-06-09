import { eq, and, desc } from "drizzle-orm";
import { painCheckins } from "../schema";
import type { DrizzleDb } from "../drizzle";

export interface ZoneMap extends Record<string, number | undefined> {
  cuello?: number; ingleL?: number; caderaL?: number;
  pubis?: number; hombroI?: number; lumbar?: number;
}

export interface PainCheckin {
  id: string; user_id: string; injury_id?: string;
  date: string; zones: ZoneMap; created_at: number;
}

type RawCheckin = typeof painCheckins.$inferSelect;

function parseCheckin(row: RawCheckin): PainCheckin {
  return {
    id: row.id,
    user_id: row.user_id,
    injury_id: row.injury_id ?? undefined,
    date: row.date,
    zones: JSON.parse(row.zones) as ZoneMap,
    created_at: row.created_at ?? 0,
  };
}

export async function getTodayCheckin(db: DrizzleDb, userId: string, date: string): Promise<PainCheckin | null> {
  const rows = await db.select().from(painCheckins)
    .where(and(eq(painCheckins.user_id, userId), eq(painCheckins.date, date)))
    .orderBy(desc(painCheckins.created_at))
    .limit(1);
  return rows[0] ? parseCheckin(rows[0]) : null;
}

export async function getRecentCheckins(db: DrizzleDb, userId: string, limit = 30): Promise<PainCheckin[]> {
  const rows = await db.select().from(painCheckins)
    .where(eq(painCheckins.user_id, userId))
    .orderBy(desc(painCheckins.date))
    .limit(limit);
  return rows.map(parseCheckin);
}

// synced=1 on write: checkins ship via sync_queue (the repo enqueues), never via
// the legacy synced=0 scan — guard queue-XOR-synced.
export async function saveCheckin(db: DrizzleDb, checkin: Omit<PainCheckin, "zones"> & { zones: ZoneMap }): Promise<void> {
  await db.insert(painCheckins)
    .values({
      id: checkin.id,
      user_id: checkin.user_id,
      injury_id: checkin.injury_id ?? null,
      date: checkin.date,
      zones: JSON.stringify(checkin.zones),
      created_at: checkin.created_at,
      synced: 1,
    })
    .onConflictDoUpdate({
      target: painCheckins.id,
      set: { zones: JSON.stringify(checkin.zones), synced: 1 },
    });
}
