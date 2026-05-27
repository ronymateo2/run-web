import { wrap } from "comlink";
import type { SqlValue, BindingSpec } from "@sqlite.org/sqlite-wasm";
import SqliteWorker from "./sqlite.worker?worker";

interface DbWorkerApi {
  exec(sql: string, bind?: BindingSpec): Promise<void>;
  query(sql: string, bind?: BindingSpec): Promise<SqlValue[][]>;
  queryObjects(sql: string, bind?: BindingSpec): Promise<Record<string, SqlValue>[]>;
}

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

const MIGRATIONS = [
  `ALTER TABLE users ADD COLUMN timezone TEXT`,
];

let proxyPromise: Promise<DbWorkerApi> | null = null;

async function initWorker(): Promise<DbWorkerApi> {
  const worker = new SqliteWorker();
  const proxy = wrap<DbWorkerApi>(worker);
  await proxy.exec(SCHEMA_SQL);
  for (const sql of MIGRATIONS) {
    try { await proxy.exec(sql); } catch { /* column already exists */ }
  }
  return proxy;
}

function getProxy(): Promise<DbWorkerApi> {
  if (!proxyPromise) proxyPromise = initWorker();
  return proxyPromise;
}

export async function exec(sql: string, bind?: unknown[]): Promise<void> {
  const proxy = await getProxy();
  await proxy.exec(sql, bind as BindingSpec | undefined);
}

export async function queryAll<T>(sql: string, bind?: unknown[]): Promise<T[]> {
  const proxy = await getProxy();
  return proxy.queryObjects(sql, bind as BindingSpec | undefined) as Promise<T[]>;
}

export async function queryAllArray(sql: string, bind?: unknown[]): Promise<unknown[][]> {
  const proxy = await getProxy();
  return proxy.query(sql, bind as BindingSpec | undefined);
}

export async function queryOne<T>(sql: string, bind?: unknown[]): Promise<T | null> {
  const rows = await queryAll<T>(sql, bind);
  return rows[0] ?? null;
}
