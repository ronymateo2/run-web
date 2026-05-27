import { drizzle } from "drizzle-orm/sqlite-proxy";
import { exec, queryAllArray } from "./client";
import * as schema from "./schema";

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let instance: DrizzleDb | null = null;

export async function getDrizzle(): Promise<DrizzleDb> {
  if (!instance) {
    instance = drizzle(
      async (sql, params, method) => {
        if (method === "run") {
          await exec(sql, params as unknown[]);
          return { rows: [] };
        }
        const rows = await queryAllArray(sql, params as unknown[]);
        return { rows: method === "get" ? (rows[0] ?? []) : rows };
      },
      { schema }
    );
  }
  return instance;
}
