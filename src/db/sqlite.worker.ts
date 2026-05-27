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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ready = sqlite3InitModule({ print: () => {}, printErr: console.error }).then(
  async (sqlite3) => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        poolUtil = await sqlite3.installOpfsSAHPoolVfs({
          forceReinitIfPreviouslyFailed: true,
        } as SAHPoolOptions);
        db = new poolUtil.OpfsSAHPoolDb("/rurana.db") as Database;
        return;
      } catch (error) {
        if (isMissingOpfsApi(error)) break;
        lastError = error;
        if (attempt < 19) {
          await sleep(Math.min(250 * (attempt + 1), 1500));
        }
      }
    }
    if (lastError) {
      console.error("[worker] OPFS unavailable after retrying SQLite SAHPool", lastError);
      throw lastError;
    }
    console.warn("[worker] OPFS unavailable — using in-memory SQLite");
    db = new sqlite3.oo1.DB(":memory:");
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

  async close(): Promise<void> {
    await ready.catch(() => {});
    db?.close();
    db = null;
    if (poolUtil && !poolUtil.isPaused()) {
      poolUtil.pauseVfs();
    }
  },
};

const workerScope = self as unknown as {
  onconnect?: (event: MessageEvent & { ports: MessagePort[] }) => void;
};

if ("onconnect" in workerScope) {
  workerScope.onconnect = (event) => {
    expose(api, event.ports[0]);
  };
} else {
  expose(api);
}
