// Local-cache maintenance, kept in the data layer so screens never run raw SQL.
// Clears the synced tables, resets the pull checkpoint, then re-pulls everything
// from the server. Also wipes and re-pulls the separate Learn OPFS database.
import { exec, queryOne } from "../db/client";
import { pullDelta, pushDelta } from "./sync";
import { learnExec } from "../db/learn-client";
import { syncArticles } from "../db/learn-sync";

const SYNCED_TABLES = [
  "exercises", "phases", "phase_criteria", "injuries",
  "exercise_logs", "pain_checkins", "sst_results", "log_day_counts",
  "prom_instruments", "prom_results",
];

export async function resetLocalCache(): Promise<void> {
  // Drain the outbox BEFORE wiping: pending mutations must reach the server so the
  // force pull brings them back. If this throws (offline/401) the reset aborts here
  // and local data stays intact.
  await pushDelta();
  // pushDelta can finish leaving rows pending (rejected rows mid-retry, unknown
  // entities). The pull SKIPS pending rows, so wiping now would leave them invisible
  // until they eventually ship — abort instead; the user retries once the queue is
  // clean. Dead-lettered rows (status='failed') don't block: the pull restores the
  // server version and their payloads stay queued for Reintentar/Descartar.
  const pending = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sync_queue WHERE status = 'pending'`,
  );
  if ((pending?.n ?? 0) > 0) {
    throw new Error("sync_queue not drained: pending mutations would be lost from view");
  }
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
