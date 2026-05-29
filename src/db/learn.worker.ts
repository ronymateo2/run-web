import { expose } from "comlink";
import sqlite3InitModule, {
  type Database,
  type SqlValue,
  type BindingSpec,
  type SAHPoolUtil,
} from "@sqlite.org/sqlite-wasm";

let db: Database | null = null;
let poolUtil: SAHPoolUtil | null = null;

type SAHPoolOptions = Parameters<
  Awaited<ReturnType<typeof sqlite3InitModule>>["installOpfsSAHPoolVfs"]
>[0] & {
  forceReinitIfPreviouslyFailed?: boolean;
};

const isMissingOpfsApi = (error: unknown) =>
  error instanceof Error && error.message.includes("Missing required OPFS APIs");

const INIT_PRAGMAS = `
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;
  PRAGMA synchronous=NORMAL;
`;

const ready = sqlite3InitModule({ print: () => {}, printErr: console.error }).then(
  async (sqlite3) => {
    try {
      poolUtil = await sqlite3.installOpfsSAHPoolVfs({
        name: "learn",
        forceReinitIfPreviouslyFailed: true,
      } as SAHPoolOptions);
      db = new poolUtil.OpfsSAHPoolDb("/learn.db") as Database;
    } catch (error) {
      if (!isMissingOpfsApi(error)) {
        console.error("[learn-worker] OPFS unavailable", error);
        throw error;
      }
      console.warn("[learn-worker] OPFS unavailable — using in-memory SQLite");
      db = new sqlite3.oo1.DB(":memory:");
    }
    db.exec(INIT_PRAGMAS);
  }
);

const api = {
  async exec(sql: string, bind: BindingSpec): Promise<void> {
    await ready;
    if (!db) throw new Error("SQLite database is closed");
    db.exec(bind ? { sql, bind } : sql);
  },

  async query(sql: string, bind?: BindingSpec): Promise<SqlValue[][]> {
    await ready;
    if (!db) throw new Error("SQLite database is closed");
    const rows: SqlValue[][] = [];
    db.exec(sql, { bind, rowMode: "array", resultRows: rows });
    return rows;
  },

  async queryObjects(sql: string, bind?: BindingSpec): Promise<Record<string, SqlValue>[]> {
    await ready;
    if (!db) throw new Error("SQLite database is closed");
    const rows: Record<string, SqlValue>[] = [];
    db.exec(sql, { bind, rowMode: "object", resultRows: rows });
    return rows;
  },

  async execBatch(statements: Array<{ sql: string; bind?: BindingSpec }>): Promise<void> {
    await ready;
    if (!db) throw new Error("SQLite database is closed");
    db.exec("BEGIN");
    try {
      for (const { sql, bind } of statements) {
        db.exec(bind ? { sql, bind } : sql);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  },

  async close(): Promise<void> {
    await ready.catch(() => {});
    db?.close();
    db = null;
    if (poolUtil && !poolUtil.isPaused()) {
      poolUtil.pauseVfs();
    }
  },
};

expose(api);
