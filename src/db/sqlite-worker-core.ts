// Shared SQLite WASM worker implementation. Each concrete worker (main DB, Learn DB)
// instantiates this with its own SAHPool name + db path — OPFS SAHPool allows ONE
// connection per pool, so every database needs its own pool, worker, and lock.
import sqlite3InitModule, {
  type Database,
  type SqlValue,
  type BindingSpec,
  type SAHPoolUtil,
} from "@sqlite.org/sqlite-wasm";

export interface SqliteWorkerConfig {
  // SAHPool VFS name. undefined = library default. The main DB predates naming and
  // its OPFS directory lives under the default name — renaming would orphan the
  // user's existing data, so leave it undefined there.
  poolName?: string;
  dbPath: string;
  label: string; // log prefix
}

export interface SqliteWorkerApi {
  exec(sql: string, bind?: BindingSpec): Promise<void>;
  query(sql: string, bind?: BindingSpec): Promise<SqlValue[][]>;
  queryObjects(sql: string, bind?: BindingSpec): Promise<Record<string, SqlValue>[]>;
  execBatch(statements: Array<{ sql: string; bind?: BindingSpec }>): Promise<void>;
  isPersistent(): Promise<boolean>;
  close(): Promise<void>;
}

type SAHPoolOptions = Parameters<
  Awaited<ReturnType<typeof sqlite3InitModule>>["installOpfsSAHPoolVfs"]
>[0] & {
  forceReinitIfPreviouslyFailed?: boolean;
};

const INIT_PRAGMAS = `
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;
  PRAGMA synchronous=NORMAL;
`;

const isMissingOpfsApi = (error: unknown) =>
  error instanceof Error && error.message.includes("Missing required OPFS APIs");

const initModule = sqlite3InitModule as (config?: {
  print?: (msg: string) => void;
  printErr?: (msg: string) => void;
}) => ReturnType<typeof sqlite3InitModule>;

export function createSqliteWorkerApi(config: SqliteWorkerConfig): SqliteWorkerApi {
  let db: Database | null = null;
  let poolUtil: SAHPoolUtil | null = null;
  // false when OPFS was unavailable and we fell back to :memory: — everything
  // written in that mode dies with the tab. The UI surfaces a warning.
  let persistent = true;

  const ready = initModule({ print: () => {}, printErr: console.error }).then(
    async (sqlite3) => {
      // Retry the pool capture IN PLACE: after a reload the previous leader's OPFS
      // access handles can take a moment to free. Retrying here (one worker, one
      // wasm compile) is far cheaper than the client tearing this worker down and
      // respawning it — that respawn loop used to burn CPU exactly when a new tab
      // was trying to take over leadership.
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          poolUtil = await sqlite3.installOpfsSAHPoolVfs({
            ...(config.poolName ? { name: config.poolName } : {}),
            forceReinitIfPreviouslyFailed: true,
          } as SAHPoolOptions);
          db = new poolUtil.OpfsSAHPoolDb(config.dbPath) as Database;
          db.exec(INIT_PRAGMAS);
          return;
        } catch (error) {
          if (isMissingOpfsApi(error)) {
            console.warn(`[${config.label}] OPFS unavailable — using in-memory SQLite`);
            persistent = false;
            db = new sqlite3.oo1.DB(":memory:");
            db.exec(INIT_PRAGMAS);
            return;
          }
          lastError = error;
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      console.error(`[${config.label}] OPFS SAHPool capture failed after retries`, lastError);
      throw lastError;
    },
  );

  return {
    async exec(sql: string, bind?: BindingSpec): Promise<void> {
      await ready;
      if (!db) throw new Error("SQLite database is closed");
      if (bind) db.exec({ sql, bind });
      else db.exec(sql);
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
          if (bind) db.exec({ sql, bind });
          else db.exec(sql);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    async isPersistent(): Promise<boolean> {
      await ready.catch(() => {});
      return persistent;
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
}
