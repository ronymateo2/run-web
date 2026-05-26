import { Hono } from "hono";

// No COOP/COEP headers needed: SQLite runs in a Web Worker via opfs-sahpool VFS
// (uses FileSystemSyncAccessHandle, not SharedArrayBuffer). Google OAuth popup works freely.
const app = new Hono<{ Bindings: Env }>();

export default app;
