// SQLite WASM worker — runs SQLite in a Web Worker with opfs-sahpool VFS.
// opfs-sahpool uses FileSystemSyncAccessHandle (Worker-only API).
// No SharedArrayBuffer needed → no COOP/COEP headers needed on main page.
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

sqlite3InitModule({ print: () => {}, printErr: console.error }).then(
  (sqlite3) => {
    sqlite3.initWorker1API();
  }
);
