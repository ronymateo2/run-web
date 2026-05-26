// SQLite WASM client — runs SQLite in a Web Worker via the Worker1 Promiser API.
// Uses opfs-sahpool VFS: OPFS persistence without SharedArrayBuffer (no COOP/COEP needed).
import { sqlite3Worker1Promiser } from "@sqlite.org/sqlite-wasm";
import SqliteWorker from "./sqlite.worker?worker";

// The promiser sends commands to the worker and resolves with the response.
type Promiser = (
  cmd: string,
  args: Record<string, unknown>
) => Promise<Record<string, unknown>>;

let promiser: Promiser | null = null;
let dbId: string | null = null;
let initPromise: Promise<void> | null = null;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT, avatar_url TEXT,
  jwt TEXT, timezone TEXT, last_sync INTEGER DEFAULT 0, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS user_auth_providers (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL,
  provider_sub TEXT NOT NULL, UNIQUE(provider, provider_sub)
);
CREATE TABLE IF NOT EXISTS injuries (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
  zone TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
  current_phase_id TEXT, focus_days TEXT, started_at INTEGER, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS phases (
  id TEXT PRIMARY KEY, injury_id TEXT NOT NULL, phase_num INTEGER NOT NULL,
  name TEXT NOT NULL, description TEXT, week_start INTEGER NOT NULL,
  week_end INTEGER NOT NULL, threshold_pct INTEGER NOT NULL DEFAULT 70, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS phase_criteria (
  id TEXT PRIMARY KEY, phase_id TEXT NOT NULL, description TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY, phase_id TEXT NOT NULL, name TEXT NOT NULL,
  detail TEXT, sets INTEGER, reps INTEGER, duration_s INTEGER,
  exercise_type TEXT NOT NULL, sort_order INTEGER DEFAULT 0, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pain_checkins (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, injury_id TEXT, date TEXT NOT NULL,
  zones TEXT NOT NULL, created_at INTEGER, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS exercise_logs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, exercise_id TEXT NOT NULL,
  session_date TEXT NOT NULL, reps_done INTEGER, pain_during INTEGER, rpe INTEGER,
  note TEXT, completed_at INTEGER, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sst_results (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, injury_id TEXT NOT NULL,
  date TEXT NOT NULL, strength_score REAL, pain_score INTEGER, note TEXT, synced INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pain_checkins_user_date ON pain_checkins(user_id, date);
CREATE INDEX IF NOT EXISTS idx_exercise_logs_user_date ON exercise_logs(user_id, session_date);
CREATE INDEX IF NOT EXISTS idx_sst_results_user_date ON sst_results(user_id, date);
`;

async function init(): Promise<void> {
  const worker = new SqliteWorker();

  promiser = await new Promise<Promiser>((resolve) => {
    let p: ReturnType<typeof sqlite3Worker1Promiser>;
    p = sqlite3Worker1Promiser({
      worker,
      onready: () => resolve(p as unknown as Promiser),
    });
  });

  // Open with opfs-sahpool (persistent, no SAB required).
  // Falls back to :memory: in environments where OPFS isn't available.
  let filename = "file:rurana.db?vfs=opfs-sahpool";
  try {
    const openRes = await promiser("open", { filename });
    dbId = (openRes as { dbId: string }).dbId;
  } catch {
    const openRes = await promiser("open", { filename: ":memory:" });
    dbId = (openRes as { dbId: string }).dbId;
    console.warn("OPFS unavailable — using in-memory SQLite");
  }

  // Run schema
  await promiser("exec", { dbId, sql: SCHEMA_SQL });

  // Additive migrations — ignore errors for columns that already exist
  const MIGRATIONS = [
    `ALTER TABLE users ADD COLUMN timezone TEXT`,
  ];
  for (const sql of MIGRATIONS) {
    try { await promiser("exec", { dbId, sql }); } catch { /* already exists */ }
  }
}

export async function getDb(): Promise<Database> {
  if (promiser && dbId) return { promiser, dbId };
  if (!initPromise) initPromise = init();
  await initPromise;
  return { promiser: promiser!, dbId: dbId! };
}

export interface Database {
  promiser: Promiser;
  dbId: string;
}

// --- Query helpers used by all query modules ---

export async function queryAll<T>(
  db: Database,
  sql: string,
  bind: unknown[] = []
): Promise<T[]> {
  const res = await db.promiser("exec", {
    dbId: db.dbId,
    sql,
    bind,
    rowMode: "object",
    resultRows: [],
  });
  return (((res.result as Record<string, unknown>)?.resultRows as T[]) ?? []);
}

export async function queryOne<T>(
  db: Database,
  sql: string,
  bind: unknown[] = []
): Promise<T | null> {
  const rows = await queryAll<T>(db, sql, bind);
  return rows[0] ?? null;
}

export async function exec(
  db: Database,
  sql: string,
  bind: unknown[] = []
): Promise<void> {
  await db.promiser("exec", { dbId: db.dbId, sql, bind });
}
