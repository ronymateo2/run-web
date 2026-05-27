import { expose } from "comlink";
import sqlite3InitModule, {
  type Database,
  type SqlValue,
  type BindingSpec,
} from "@sqlite.org/sqlite-wasm";

let db: Database;

const ready = sqlite3InitModule({ print: () => {}, printErr: console.error }).then(
  async (sqlite3) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { OpfsSAHPoolDb } = await sqlite3.installOpfsSAHPoolVfs({});
        db = new OpfsSAHPoolDb("rurana.db") as Database;
        return;
      } catch {
        if (attempt < 4) {
          await sleep(300 * (attempt + 1));
        }
      }
    }
    console.warn("[worker] OPFS unavailable — using in-memory SQLite");
    db = new sqlite3.oo1.DB(":memory:");
  }
);

expose({
  async exec(sql: string, bind: BindingSpec): Promise<void> {
    await ready;
    db.exec(bind ? { sql, bind } : sql);
  },

  async query(sql: string, bind?: BindingSpec): Promise<SqlValue[][]> {
    await ready;
    const rows: SqlValue[][] = [];
    db.exec(sql, { bind, rowMode: "array", resultRows: rows });
    return rows;
  },

  async queryObjects(sql: string, bind?: BindingSpec): Promise<Record<string, SqlValue>[]> {
    await ready;
    const rows: Record<string, SqlValue>[] = [];
    db.exec(sql, { bind, rowMode: "object", resultRows: rows });
    return rows;
  },
});
