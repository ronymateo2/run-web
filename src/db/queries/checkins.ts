import { queryAll, queryOne, exec, type Database } from "../client";

export interface ZoneMap extends Record<string, number | undefined> {
  ingleL?: number; ingleR?: number; caderaL?: number;
  caderaR?: number; pubis?: number; hombroD?: number; lumbar?: number;
}

export interface PainCheckin {
  id: string; user_id: string; injury_id?: string;
  date: string; zones: ZoneMap; created_at: number;
}

export async function getTodayCheckin(db: Database, userId: string, date: string): Promise<PainCheckin | null> {
  const row = await queryOne<{ id: string; user_id: string; injury_id: string; date: string; zones: string; created_at: number }>(
    db, `SELECT * FROM pain_checkins WHERE user_id = ? AND date = ? ORDER BY created_at DESC LIMIT 1`, [userId, date]
  );
  if (!row) return null;
  return { ...row, zones: JSON.parse(row.zones) as ZoneMap };
}

export async function getRecentCheckins(db: Database, userId: string, limit = 30): Promise<PainCheckin[]> {
  const rows = await queryAll<{ id: string; user_id: string; injury_id: string; date: string; zones: string; created_at: number }>(
    db, `SELECT * FROM pain_checkins WHERE user_id = ? ORDER BY date DESC LIMIT ?`, [userId, limit]
  );
  return rows.map(r => ({ ...r, zones: JSON.parse(r.zones) as ZoneMap }));
}

export async function saveCheckin(db: Database, checkin: Omit<PainCheckin, "zones"> & { zones: ZoneMap }): Promise<void> {
  await exec(db, `
    INSERT INTO pain_checkins (id, user_id, injury_id, date, zones, created_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(id) DO UPDATE SET zones = excluded.zones
  `, [checkin.id, checkin.user_id, checkin.injury_id ?? null, checkin.date,
      JSON.stringify(checkin.zones), checkin.created_at]);
}
