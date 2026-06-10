import { eq, and, desc, isNull } from "drizzle-orm";
import { painCheckins } from "../schema";
import type { DrizzleDb } from "../drizzle";
import type { SqlStatement } from "../client";

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
    .where(and(eq(painCheckins.user_id, userId), eq(painCheckins.date, date), isNull(painCheckins.deleted_at)))
    .orderBy(desc(painCheckins.created_at))
    .limit(1);
  return rows[0] ? parseCheckin(rows[0]) : null;
}

export async function getRecentCheckins(db: DrizzleDb, userId: string, limit = 30): Promise<PainCheckin[]> {
  const rows = await db.select().from(painCheckins)
    .where(and(eq(painCheckins.user_id, userId), isNull(painCheckins.deleted_at)))
    .orderBy(desc(painCheckins.date))
    .limit(limit);
  return rows.map(parseCheckin);
}

// synced=1 on write: checkins ship via sync_queue, never via the legacy synced=0
// scan — guard queue-XOR-synced. Returned as statements so the repo can commit the
// write and its queue entry in ONE execBatch (atomic).
export function saveCheckinStatements(checkin: Omit<PainCheckin, "zones"> & { zones: ZoneMap }): SqlStatement[] {
  return [{
    sql: `INSERT INTO pain_checkins (id, user_id, injury_id, date, zones, created_at, deleted_at, synced)
          VALUES (?, ?, ?, ?, ?, ?, NULL, 1)
          ON CONFLICT(id) DO UPDATE SET zones = excluded.zones, deleted_at = NULL, synced = 1`,
    bind: [checkin.id, checkin.user_id, checkin.injury_id ?? null, checkin.date,
           JSON.stringify(checkin.zones), checkin.created_at],
  }];
}
