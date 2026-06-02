// 5SST data boundary. Resolves Drizzle internally; UI never touches useDb/SQL.
import { getDrizzle } from "../../db/drizzle";
import * as q from "../../db/queries/sst";

export type SstResult = q.SstResult;
export type NewSstResult = q.NewSstResult;

// Pure helper (no I/O) re-exported so callers don't reach into queries/*.
export const isSstPreferredToday = q.isSstPreferredToday;

export const sstRepository = {
  async getRecentSst(userId: string, limit = 12): Promise<SstResult[]> {
    return q.getRecentSst(await getDrizzle(), userId, limit);
  },
  async getTodaySst(userId: string, date: string): Promise<SstResult | null> {
    return q.getTodaySst(await getDrizzle(), userId, date);
  },

  // --- Write (mark synced=0; caller triggers push()). ---
  async saveSstResult(result: NewSstResult): Promise<void> {
    return q.saveSstResult(await getDrizzle(), result);
  },
};
