// Sync local SQLite (OPFS) with run-api (D1).
// Strategy: offline-first. Pull delta on app start; push unsynced rows after mutations.

import { queryAll, exec, type Database } from "./client";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

export async function pullDelta(db: Database, token: string): Promise<void> {
  const users = await queryAll<{ last_sync: number }>(db, `SELECT last_sync FROM users LIMIT 1`);
  const since = users[0]?.last_sync ?? 0;

  const res = await fetch(`${API_BASE}/api/sync/pull?since=${since}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return;

  const data = await res.json() as {
    serverTime: number;
    injuries: Record<string, unknown>[];
    phases: Record<string, unknown>[];
    exercises: Record<string, unknown>[];
    pain_checkins: Record<string, unknown>[];
    exercise_logs: Record<string, unknown>[];
    sst_results: Record<string, unknown>[];
  };

  // Upsert each table
  for (const row of data.injuries ?? []) {
    await exec(db, `INSERT OR REPLACE INTO injuries (id, user_id, name, zone, status, current_phase_id, focus_days, started_at, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [row.id, row.user_id, row.name, row.zone, row.status, row.current_phase_id ?? null,
       row.focus_days ?? null, row.started_at ?? null]);
  }
  for (const row of data.phases ?? []) {
    await exec(db, `INSERT OR REPLACE INTO phases (id, injury_id, phase_num, name, description, week_start, week_end, threshold_pct, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [row.id, row.injury_id, row.phase_num, row.name, row.description ?? null,
       row.week_start, row.week_end, row.threshold_pct]);
  }
  for (const row of data.exercises ?? []) {
    await exec(db, `INSERT OR REPLACE INTO exercises (id, phase_id, name, detail, sets, reps, duration_s, exercise_type, sort_order, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [row.id, row.phase_id, row.name, row.detail ?? null, row.sets ?? null,
       row.reps ?? null, row.duration_s ?? null, row.exercise_type, row.sort_order ?? 0]);
  }
  for (const row of data.pain_checkins ?? []) {
    await exec(db, `INSERT OR REPLACE INTO pain_checkins (id, user_id, injury_id, date, zones, created_at, synced)
      VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [row.id, row.user_id, row.injury_id ?? null, row.date, row.zones, row.created_at]);
  }
  for (const row of data.exercise_logs ?? []) {
    await exec(db, `INSERT OR REPLACE INTO exercise_logs (id, user_id, exercise_id, session_date, reps_done, pain_during, rpe, note, completed_at, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [row.id, row.user_id, row.exercise_id, row.session_date, row.reps_done ?? null,
       row.pain_during ?? null, row.rpe ?? null, row.note ?? null, row.completed_at ?? null]);
  }
  for (const row of data.sst_results ?? []) {
    await exec(db, `INSERT OR REPLACE INTO sst_results (id, user_id, injury_id, date, strength_score, pain_score, note, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [row.id, row.user_id, row.injury_id, row.date, row.strength_score ?? null,
       row.pain_score ?? null, row.note ?? null]);
  }

  // Update last_sync timestamp
  await exec(db, `UPDATE users SET last_sync = ?`, [data.serverTime]);
}

export async function pushDelta(db: Database, token: string): Promise<void> {
  const checkins = await queryAll(db, `SELECT * FROM pain_checkins WHERE synced = 0`);
  const logs = await queryAll(db, `SELECT * FROM exercise_logs WHERE synced = 0`);
  const sst = await queryAll(db, `SELECT * FROM sst_results WHERE synced = 0`);

  if (checkins.length === 0 && logs.length === 0 && sst.length === 0) return;

  const res = await fetch(`${API_BASE}/api/sync/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pain_checkins: checkins, exercise_logs: logs, sst_results: sst }),
  });

  if (res.ok) {
    await exec(db, `UPDATE pain_checkins SET synced = 1 WHERE synced = 0`);
    await exec(db, `UPDATE exercise_logs SET synced = 1 WHERE synced = 0`);
    await exec(db, `UPDATE sst_results SET synced = 1 WHERE synced = 0`);
  }
}
