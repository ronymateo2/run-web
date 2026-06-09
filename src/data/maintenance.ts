// Local-cache maintenance, kept in the data layer so screens never run raw SQL.
// Clears the synced tables, resets the pull checkpoint, then re-pulls everything
// from the server. Also wipes and re-pulls the separate Learn OPFS database.
import { exec } from "../db/client";
import { pullDelta } from "./sync";
import { learnExec } from "../db/learn-client";
import { syncArticles } from "../db/learn-sync";

const SYNCED_TABLES = [
  "exercises", "phases", "phase_criteria", "injuries",
  "exercise_logs", "pain_checkins", "sst_results", "log_day_counts",
  "prom_instruments", "prom_results",
];

export async function resetLocalCache(): Promise<void> {
  for (const table of SYNCED_TABLES) {
    await exec(`DELETE FROM ${table}`);
  }
  await exec(`UPDATE users SET last_sync = 0`);
  await exec(`DELETE FROM metadata WHERE key = 'last_pull_at'`);
  // sync_queue is NOT wiped: pending mutations carry their own payloads and must
  // survive a cache reset (they re-push after the force pull).
  await pullDelta({ force: true });
  // Learn DB is a separate OPFS database with its own sync — clear it too.
  // Drop _meta so syncArticles skips its throttle and pulls fresh.
  await learnExec(`DELETE FROM articles`);
  await learnExec(`DELETE FROM _meta`);
  await syncArticles();
}
