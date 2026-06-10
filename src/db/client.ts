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
  week_end INTEGER NOT NULL, threshold_pct INTEGER NOT NULL DEFAULT 70, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS phase_criteria (
  id TEXT PRIMARY KEY, phase_id TEXT NOT NULL, description TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, synced INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY, phase_id TEXT NOT NULL, name TEXT NOT NULL,
  detail TEXT, sets INTEGER, reps INTEGER, duration_s INTEGER,
  exercise_type TEXT NOT NULL, sort_order INTEGER DEFAULT 0, video_url TEXT, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pain_checkins (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, injury_id TEXT, date TEXT NOT NULL,
  zones TEXT NOT NULL, created_at INTEGER, deleted_at INTEGER, synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS exercise_logs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, exercise_id TEXT NOT NULL,
  session_date TEXT NOT NULL, reps_done INTEGER, pain_during INTEGER, rpe INTEGER,
  note TEXT, completed_at INTEGER, deleted_at INTEGER, synced INTEGER DEFAULT 0
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

const MIGRATIONS: Array<{ id: number; sql: string }> = [
  { id: 1, sql: `ALTER TABLE users ADD COLUMN timezone TEXT` },
  { id: 2, sql: `ALTER TABLE phase_criteria ADD COLUMN synced INTEGER NOT NULL DEFAULT 1` },
  { id: 3, sql: `ALTER TABLE exercise_logs ADD COLUMN deleted_at INTEGER` },
  { id: 4, sql: `ALTER TABLE phases ADD COLUMN deleted_at INTEGER` },
  { id: 5, sql: `ALTER TABLE phase_criteria ADD COLUMN deleted_at INTEGER` },
  { id: 6, sql: `ALTER TABLE exercises ADD COLUMN video_url TEXT` },
  { id: 7, sql: `ALTER TABLE phases ADD COLUMN focus_days TEXT` },
  // Backfill the rollup from existing raw logs (runs once). The server only ships
  // day-groups changed since last_sync, so without this an existing install would
  // read zero progress until a forced resync. New installs no-op (empty source).
  {
    id: 8,
    sql: `INSERT OR IGNORE INTO log_day_counts (user_id, exercise_id, session_date, sets)
          SELECT user_id, exercise_id, session_date, COUNT(*)
          FROM exercise_logs WHERE deleted_at IS NULL
          GROUP BY user_id, exercise_id, session_date`,
  },
  // pain_checkins moved from the legacy synced=0 push path to sync_queue. Move any
  // still-unsynced rows into the queue and mark them synced=1, otherwise they'd be
  // stranded forever (the legacy push no longer scans this table).
  {
    id: 9,
    sql: `INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
          SELECT lower(hex(randomblob(16))), 'checkin', id, 'upsert',
                 json_object('id', id, 'user_id', user_id, 'injury_id', injury_id,
                             'date', date, 'zones', zones, 'created_at', created_at),
                 'pending', 0, strftime('%s','now')*1000, strftime('%s','now')*1000
          FROM pain_checkins WHERE synced = 0;
          UPDATE pain_checkins SET synced = 1 WHERE synced = 0;`,
  },
  // Remaining entities moved to sync_queue (same rationale as id 9): backfill every
  // still-unsynced row into the queue, then retire the synced=0 flag for pushes.
  // phase_criteria rides BOTH channels (row content + criteria_done) because a
  // synced=0 row could mean either kind of pending change — exactly what the old
  // legacy push sent. `done` must serialize as JSON boolean (server zod requires it).
  {
    id: 10,
    sql: `
INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
SELECT lower(hex(randomblob(16))), 'exercise_log', id, 'upsert',
       json_object('id', id, 'user_id', user_id, 'exercise_id', exercise_id, 'session_date', session_date,
                   'reps_done', reps_done, 'pain_during', pain_during, 'rpe', rpe, 'note', note,
                   'completed_at', completed_at, 'deleted_at', deleted_at),
       'pending', 0, strftime('%s','now')*1000, strftime('%s','now')*1000
FROM exercise_logs WHERE synced = 0;
UPDATE exercise_logs SET synced = 1 WHERE synced = 0;

INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
SELECT lower(hex(randomblob(16))), 'sst', id, 'upsert',
       json_object('id', id, 'user_id', user_id, 'injury_id', injury_id, 'date', date,
                   'strength_score', strength_score, 'pain_score', pain_score, 'note', note),
       'pending', 0, strftime('%s','now')*1000, strftime('%s','now')*1000
FROM sst_results WHERE synced = 0;
UPDATE sst_results SET synced = 1 WHERE synced = 0;

INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
SELECT lower(hex(randomblob(16))), 'prom', id, 'upsert',
       json_object('id', id, 'user_id', user_id, 'injury_id', injury_id, 'instrument_id', instrument_id,
                   'date', date, 'score', score, 'answers', answers, 'note', note),
       'pending', 0, strftime('%s','now')*1000, strftime('%s','now')*1000
FROM prom_results WHERE synced = 0;
UPDATE prom_results SET synced = 1 WHERE synced = 0;

INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
SELECT lower(hex(randomblob(16))), 'injury', id, 'upsert',
       json_object('id', id, 'current_phase_id', current_phase_id, 'focus_days', focus_days),
       'pending', 0, strftime('%s','now')*1000, strftime('%s','now')*1000
FROM injuries WHERE synced = 0;
UPDATE injuries SET synced = 1 WHERE synced = 0;

INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
SELECT lower(hex(randomblob(16))), 'phase', id, 'upsert',
       json_object('id', id, 'injury_id', injury_id, 'phase_num', phase_num, 'name', name,
                   'description', description, 'week_start', week_start, 'week_end', week_end,
                   'threshold_pct', threshold_pct, 'focus_days', focus_days, 'deleted_at', deleted_at),
       'pending', 0, strftime('%s','now')*1000, strftime('%s','now')*1000
FROM phases WHERE synced = 0;
UPDATE phases SET synced = 1 WHERE synced = 0;

INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
SELECT lower(hex(randomblob(16))), 'exercise', id, 'upsert',
       json_object('id', id, 'phase_id', phase_id, 'name', name, 'detail', detail, 'sets', sets,
                   'reps', reps, 'duration_s', duration_s, 'exercise_type', exercise_type,
                   'sort_order', sort_order, 'video_url', video_url),
       'pending', 0, strftime('%s','now')*1000, strftime('%s','now')*1000
FROM exercises WHERE synced = 0;
UPDATE exercises SET synced = 1 WHERE synced = 0;

INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
SELECT lower(hex(randomblob(16))), 'phase_criterion', id, 'upsert',
       json_object('id', id, 'phase_id', phase_id, 'description', description, 'deleted_at', deleted_at),
       'pending', 0, strftime('%s','now')*1000, strftime('%s','now')*1000
FROM phase_criteria WHERE synced = 0;
INSERT INTO sync_queue (id, entity, entity_id, operation, payload_json, status, attempts, created_at, updated_at)
SELECT lower(hex(randomblob(16))), 'criteria_done', id, 'upsert',
       json_object('criteria_id', id, 'done', json(CASE WHEN done THEN 'true' ELSE 'false' END)),
       'pending', 0, strftime('%s','now')*1000, strftime('%s','now')*1000
FROM phase_criteria WHERE synced = 0;
UPDATE phase_criteria SET synced = 1 WHERE synced = 0;`,
  },
  // Tombstones for the three tables that had no delete propagation: a server-side
  // delete (deleted_at) now reaches clients via the pull instead of living forever.
  // On fresh installs SCHEMA_SQL already has the columns; the duplicate-column
  // catch below makes this a no-op there.
  {
    id: 11,
    sql: `ALTER TABLE pain_checkins ADD COLUMN deleted_at INTEGER;
ALTER TABLE sst_results ADD COLUMN deleted_at INTEGER;
ALTER TABLE prom_results ADD COLUMN deleted_at INTEGER;`,
  },
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
