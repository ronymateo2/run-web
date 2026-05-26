
import { queryAll, queryOne, exec, type Database } from "../client";

export interface SstResult {
  id: string; user_id: string; injury_id: string; date: string;
  strength_score?: number; pain_score?: number; note?: string;
}

export async function getRecentSst(db: Database, userId: string, limit = 12): Promise<SstResult[]> {
  return queryAll<SstResult>(
    db,
    `SELECT * FROM sst_results WHERE user_id = ? ORDER BY date DESC LIMIT ?`,
    [userId, limit]
  );
}

export async function getTodaySst(db: Database, userId: string, date: string): Promise<SstResult | null> {
  return queryOne<SstResult>(
    db,
    `SELECT * FROM sst_results WHERE user_id = ? AND date = ? LIMIT 1`,
    [userId, date]
  );
}

export async function saveSstResult(db: Database, result: SstResult): Promise<void> {
  await exec(db, `
    INSERT INTO sst_results (id, user_id, injury_id, date, strength_score, pain_score, note, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(id) DO UPDATE SET strength_score = excluded.strength_score,
      pain_score = excluded.pain_score, note = excluded.note
  `, [result.id, result.user_id, result.injury_id, result.date,
      result.strength_score ?? null, result.pain_score ?? null, result.note ?? null]);
}

/** Day of week (lowercase 'mon','tue',...) */
export function isSstPreferredToday(tz?: string | null, focusDays: string[] = ["tue", "thu"]): boolean {
  const zone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dow = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: zone })
    .format(new Date()).toLowerCase();
  return focusDays.includes(dow);
}
