// SQLite WASM worker — runs SQLite in a Web Worker with opfs-sahpool VFS.
// opfs-sahpool uses FileSystemSyncAccessHandle (Worker-only API).
// No SharedArrayBuffer needed → no COOP/COEP headers needed on main page.
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

sqlite3InitModule({ print: () => {}, printErr: console.error }).then(async (sqlite3) => {
  try {
    // opfs-sahpool must be explicitly installed before Worker1 API opens any DB.
    // Uses FileSystemSyncAccessHandle — no SharedArrayBuffer or COOP/COEP needed.
    await (sqlite3 as unknown as { installOpfsSAHPoolVfs(o: object): Promise<unknown> })
      .installOpfsSAHPoolVfs({});
  } catch (e) {
    console.warn("[worker] opfs-sahpool install failed:", e);
  }
  sqlite3.initWorker1API();
});
