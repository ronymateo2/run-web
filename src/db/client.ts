// Main app database (OPFS, /rurana.db): schema + migrations + the public query API.
// Leader election / cross-tab RPC live in sqlite-client-core.ts (shared with Learn).
import type { BindingSpec } from "@sqlite.org/sqlite-wasm";
import { createSqliteClient, type DbWorkerApi } from "./sqlite-client-core";
import DedicatedSqliteWorker from "./sqlite.worker?worker";

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
  week_end INTEGER NOT NULL, threshold_pct INTEGER NOT NULL DEFAULT 70,
  focus_days TEXT, deleted_at INTEGER, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS phase_criteria (
  id TEXT PRIMARY KEY, phase_id TEXT NOT NULL, description TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER, synced INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY, phase_id TEXT NOT NULL, name TEXT NOT NULL,
  detail TEXT, sets INTEGER, reps INTEGER, duration_s INTEGER,
  exercise_type TEXT NOT NULL, sort_order INTEGER DEFAULT 0, video_url TEXT,
  warmup_sets INTEGER NOT NULL DEFAULT 0, archived_at INTEGER, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pain_checkins (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, injury_id TEXT, date TEXT NOT NULL,
  zones TEXT NOT NULL, created_at INTEGER, deleted_at INTEGER, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS exercise_logs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, exercise_id TEXT NOT NULL,
  session_date TEXT NOT NULL, reps_done INTEGER, pain_during INTEGER, rpe INTEGER,
  note TEXT, set_type TEXT NOT NULL DEFAULT 'normal', completed_at INTEGER, deleted_at INTEGER, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sst_results (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, injury_id TEXT NOT NULL,
  date TEXT NOT NULL, strength_score REAL, pain_score INTEGER, note TEXT,
  deleted_at INTEGER, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS log_day_counts (
  user_id TEXT NOT NULL, exercise_id TEXT NOT NULL, session_date TEXT NOT NULL,
  sets INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, exercise_id, session_date)
);
CREATE TABLE IF NOT EXISTS prom_instruments (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, zones TEXT NOT NULL, questions TEXT NOT NULL,
  max_per_item INTEGER NOT NULL, invert INTEGER NOT NULL DEFAULT 0,
  better_is_higher INTEGER NOT NULL DEFAULT 0, every_days INTEGER NOT NULL DEFAULT 14, sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS prom_results (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, injury_id TEXT NOT NULL, instrument_id TEXT NOT NULL,
  date TEXT NOT NULL, score REAL, answers TEXT, note TEXT, deleted_at INTEGER, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY, entity TEXT NOT NULL, entity_id TEXT NOT NULL,
  operation TEXT NOT NULL, payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_log_day_counts_user ON log_day_counts(user_id, exercise_id);
CREATE INDEX IF NOT EXISTS idx_prom_results_user_date ON prom_results(user_id, date);
CREATE INDEX IF NOT EXISTS idx_pain_checkins_user_date ON pain_checkins(user_id, date);
CREATE INDEX IF NOT EXISTS idx_exercise_logs_user_date ON exercise_logs(user_id, session_date);
CREATE INDEX IF NOT EXISTS idx_sst_results_user_date ON sst_results(user_id, date);
CREATE INDEX IF NOT EXISTS idx_injuries_user ON injuries(user_id);
CREATE INDEX IF NOT EXISTS idx_phases_injury ON phases(injury_id);
CREATE INDEX IF NOT EXISTS idx_exercises_phase ON exercises(phase_id);
CREATE INDEX IF NOT EXISTS idx_phase_criteria_phase ON phase_criteria(phase_id);
`;

// Migrations 1–14 were squashed into SCHEMA_SQL above (all clients were forced to
// reinstall, so every OPFS DB starts fresh at the current schema). Keep this list
// empty; the next migration MUST start at id 15 — ids 1–14 stay retired so a rare
// straggler that never reinstalled (already has 1–14 in _migrations) doesn't re-run
// or collide with a reused id.
const MIGRATIONS: Array<{ id: number; sql: string }> = [
  // id 15: archive exercises (no delete). ids 1–14 retired by the squash.
  { id: 15, sql: `ALTER TABLE exercises ADD COLUMN archived_at INTEGER` },
];

async function initSchema(proxy: DbWorkerApi): Promise<void> {
  await proxy.exec(SCHEMA_SQL);
  await proxy.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`
  );
  const applied = await proxy.queryObjects(`SELECT id FROM _migrations`) as { id: number }[];
  const appliedIds = new Set(applied.map((r) => r.id));
  for (const migration of MIGRATIONS) {
    if (!appliedIds.has(migration.id)) {
      try {
        await proxy.exec(migration.sql);
      } catch (error) {
        // Schema already in desired state (applied before migration tracking existed).
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes("duplicate column name") && !msg.includes("already exists")) {
          throw error;
        }
      }
      await proxy.exec(`INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`, [
        migration.id,
        Date.now(),
      ] as BindingSpec);
    }
  }
}

const client = createSqliteClient({
  createWorker: () => new DedicatedSqliteWorker(),
  lockName: "rurana.sqlite.opfs",
  channelName: "rurana.sqlite.rpc",
  label: "db",
  initSchema,
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void client.dispose();
  });
}

// A parametrized statement, as accepted by execBatch. Write paths build arrays of
// these so a local write and its sync_queue entry commit in one transaction.
export type SqlStatement = { sql: string; bind?: unknown[] };

export const exec = client.exec;
export const execBatch = client.execBatch;
export const queryAll = client.queryAll;
export const queryAllArray = client.queryAllArray;
export const queryOne = client.queryOne;

// false when the worker fell back to in-memory SQLite (OPFS unavailable): nothing
// written this session survives a reload. The UI shows a degraded-storage warning.
export const isStoragePersistent = client.isPersistent;

// DevTools console access. On in dev; in prod set localStorage.__db_debug="1" then reload.
// Usage: await db.queryAll("SELECT * FROM injuries")
if (typeof window !== "undefined") {
  if (import.meta.env.DEV || localStorage.getItem("__db_debug") === "1") {
    (window as unknown as Record<string, unknown>).db = {
      exec,
      execBatch,
      queryAll,
      queryAllArray,
      queryOne,
    };
  }
}
