import { users } from "../schema";
import type { DrizzleDb } from "../drizzle";

export type User = typeof users.$inferSelect;

export async function getSessionUser(db: DrizzleDb): Promise<User | null> {
  const rows = await db.select().from(users).limit(1);
  return rows[0] ?? null;
}
