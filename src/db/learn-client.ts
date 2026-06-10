// Learn database (OPFS, /learn.db): article cache with its own schema and sync.
// Separate pool/worker/lock from the main DB — SAHPool allows one connection per
// pool, and losing this cache is harmless (articles re-download via syncArticles).
// Leader election / cross-tab RPC live in sqlite-client-core.ts (shared).
import { createSqliteClient, type DbWorkerApi } from "./sqlite-client-core";
import LearnSqliteWorker from "./learn.worker?worker";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  content TEXT,
  notion_url TEXT,
  tags TEXT,
  published_at TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS _meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const client = createSqliteClient({
  createWorker: () => new LearnSqliteWorker(),
  lockName: "rurana.learn.opfs",
  channelName: "rurana.learn.rpc",
  label: "learn-db",
  initSchema: (proxy: DbWorkerApi) => proxy.exec(SCHEMA_SQL),
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void client.dispose();
  });
}

export const learnExec = client.exec;
export const learnExecBatch = client.execBatch;
export const learnQueryAll = client.queryAll;
export const learnQueryOne = client.queryOne;
