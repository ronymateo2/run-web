import { sql } from "drizzle-orm";
import { users } from "../schema";
import type { DrizzleDb } from "../drizzle";

export type User = typeof users.$inferSelect;

export interface UserUpsert {
  id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
  timezone?: string | null;
}

export async function getSessionUser(db: DrizzleDb): Promise<User | null> {
  const rows = await db.select().from(users).limit(1);
  return rows[0] ?? null;
}

// Upsert the local session user (profile cache for offline display). last_sync stays
// untouched on conflict; timezone only overwrites when a non-null value is provided
// (COALESCE) so a profile restore without tz doesn't wipe an existing one.
export async function upsertUser(db: DrizzleDb, u: UserUpsert): Promise<void> {
  await db.insert(users)
    .values({
      id: u.id,
      email: u.email,
      name: u.name,
      avatar_url: u.avatar_url ?? null,
      timezone: u.timezone ?? null,
      last_sync: 0,
      created_at: Date.now(),
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        name: u.name,
        avatar_url: u.avatar_url ?? null,
        timezone: sql`COALESCE(${u.timezone ?? null}, ${users.timezone})`,
      },
    });
}

export async function clearJwt(db: DrizzleDb): Promise<void> {
  await db.update(users).set({ jwt: null });
}

export async function setUserTimezone(db: DrizzleDb, tz: string): Promise<void> {
  await db.update(users).set({ timezone: tz });
}
