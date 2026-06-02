// Local-cache maintenance, kept in the data layer so screens never run raw SQL.
// Clears the synced tables, resets the pull checkpoint, then re-pulls everything
// from the server. Also wipes and re-pulls the separate Learn OPFS database.
import { exec } from "../db/client";
import { pullDelta } from "../db/sync";
import { learnExec } from "../db/learn-client";
import { syncArticles } from "../db/learn-sync";

const SYNCED_TABLES = [
  "exercises", "phases", "phase_criteria", "injuries",
  "exercise_logs", "pain_checkins", "sst_results", "log_day_counts",
];

export async function resetLocalCache(): Promise<void> {
  for (const table of SYNCED_TABLES) {
    await exec(`DELETE FROM ${table}`);
  }
  await exec(`UPDATE users SET last_sync = 0`);
  await pullDelta({ force: true });
  // Learn DB is a separate OPFS database with its own sync — clear it too.
  // Drop _meta so syncArticles skips its throttle and pulls fresh.
  await learnExec(`DELETE FROM articles`);
  await learnExec(`DELETE FROM _meta`);
  await syncArticles();
}
