// Pain check-in data boundary. Resolves Drizzle internally; UI never touches useDb/SQL.
import { getDrizzle } from "../../db/drizzle";
import * as q from "../../db/queries/checkins";

export type ZoneMap = q.ZoneMap;
export type PainCheckin = q.PainCheckin;

export const checkinRepository = {
  async getTodayCheckin(userId: string, date: string): Promise<PainCheckin | null> {
    return q.getTodayCheckin(await getDrizzle(), userId, date);
  },
  async getRecentCheckins(userId: string, limit = 30): Promise<PainCheckin[]> {
    return q.getRecentCheckins(await getDrizzle(), userId, limit);
  },

  // --- Write (mark synced=0; caller triggers push()). ---
  async saveCheckin(checkin: Omit<PainCheckin, "zones"> & { zones: ZoneMap }): Promise<void> {
    return q.saveCheckin(await getDrizzle(), checkin);
  },
};
