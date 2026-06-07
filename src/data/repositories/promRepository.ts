// PROMs data boundary. Resolves Drizzle internally; UI never touches useDb/SQL.
import { getDrizzle } from "../../db/drizzle";
import * as q from "../../db/queries/prom";

export type PromInstrument = q.PromInstrument;
export type PromQuestion = q.PromQuestion;
export type PromResult = q.PromResult;
export type NewPromResult = q.NewPromResult;
export type SeverityBand = q.SeverityBand;
export type PromTrend = q.PromTrend;
export type WorstItem = q.WorstItem;

// Pure helpers (no I/O) re-exported so callers don't reach into queries/*.
export const scoreInstrument = q.scoreInstrument;
export const isPromDue = q.isPromDue;
export const instrumentsForInjury = q.instrumentsForInjury;
export const severityBand = q.severityBand;
export const promTrend = q.promTrend;
export const worstItems = q.worstItems;

export const promRepository = {
  async getInstruments(): Promise<PromInstrument[]> {
    return q.getInstruments(await getDrizzle());
  },
  async getRecentProm(userId: string, limit = 30): Promise<PromResult[]> {
    return q.getRecentProm(await getDrizzle(), userId, limit);
  },
  async getRecentPromByInstrument(userId: string, instrumentId: string, limit = 12): Promise<PromResult[]> {
    return q.getRecentPromByInstrument(await getDrizzle(), userId, instrumentId, limit);
  },
  async getLastPromDate(userId: string, instrumentId: string): Promise<string | null> {
    return q.getLastPromDate(await getDrizzle(), userId, instrumentId);
  },

  // --- Write (mark synced=0; caller triggers push()). ---
  async savePromResult(result: NewPromResult): Promise<void> {
    return q.savePromResult(await getDrizzle(), result);
  },
};
