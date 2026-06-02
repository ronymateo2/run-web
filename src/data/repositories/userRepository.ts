// User/session data boundary. Resolves Drizzle internally; UI never touches useDb/SQL.
import { getDrizzle } from "../../db/drizzle";
import * as q from "../../db/queries/users";

export type User = q.User;
export type UserUpsert = q.UserUpsert;

export const userRepository = {
  async getSessionUser(): Promise<User | null> {
    return q.getSessionUser(await getDrizzle());
  },

  // --- Writes ---
  async upsertUser(u: UserUpsert): Promise<void> {
    return q.upsertUser(await getDrizzle(), u);
  },
  async clearJwt(): Promise<void> {
    return q.clearJwt(await getDrizzle());
  },
  async setTimezone(tz: string): Promise<void> {
    return q.setUserTimezone(await getDrizzle(), tz);
  },
};
