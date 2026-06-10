// 5SST data boundary. Resolves Drizzle internally; UI never touches useDb/SQL.
import { getDrizzle } from "../../db/drizzle";
import { execBatch } from "../../db/client";
import * as q from "../../db/queries/sst";
import { buildQueueStatements } from "../sync";

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

  // --- Write (outbox pattern). Local write + sync_queue entry commit in ONE
  // execBatch (atomic); caller triggers push(). ---
  async saveSstResult(result: NewSstResult): Promise<void> {
    await execBatch([
      ...q.saveSstResultStatements(result),
      ...buildQueueStatements({
        entity: "sst", entityId: result.id, operation: "upsert",
        payload: {
          id: result.id, user_id: result.user_id, injury_id: result.injury_id,
          date: result.date, strength_score: result.strength_score ?? null,
          pain_score: result.pain_score ?? null, note: result.note ?? null,
        },
      }),
    ]);
  },
};
