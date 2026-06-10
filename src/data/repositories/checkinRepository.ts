// Pain check-in data boundary. Resolves Drizzle internally; UI never touches useDb/SQL.
import { getDrizzle } from "../../db/drizzle";
import { execBatch } from "../../db/client";
import * as q from "../../db/queries/checkins";
import { buildQueueStatements } from "../sync";

export type ZoneMap = q.ZoneMap;
export type PainCheckin = q.PainCheckin;

export const checkinRepository = {
  async getTodayCheckin(userId: string, date: string): Promise<PainCheckin | null> {
    return q.getTodayCheckin(await getDrizzle(), userId, date);
  },
  async getRecentCheckins(userId: string, limit = 30): Promise<PainCheckin[]> {
    return q.getRecentCheckins(await getDrizzle(), userId, limit);
  },

  // --- Write (outbox pattern). Local write + sync_queue entry commit in ONE
  // execBatch: a crash can never strand a write without its queue entry.
  // Guard queue-XOR-synced: checkins never use the legacy synced=0 path.
  async saveCheckin(checkin: Omit<PainCheckin, "zones"> & { zones: ZoneMap }): Promise<void> {
    await execBatch([
      ...q.saveCheckinStatements(checkin),
      ...buildQueueStatements({
        entity: "checkin",
        entityId: checkin.id,
        operation: "upsert",
        payload: {
          id: checkin.id,
          user_id: checkin.user_id,
          injury_id: checkin.injury_id ?? null,
          date: checkin.date,
          zones: JSON.stringify(checkin.zones),
          created_at: checkin.created_at,
        },
      }),
    ]);
  },
};
