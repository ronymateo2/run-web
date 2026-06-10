// Learn database worker: separate OPFS pool ("learn") — SAHPool allows one
// connection per pool, and Learn's article cache must not contend with the main DB.
import { expose } from "comlink";
import { createSqliteWorkerApi } from "./sqlite-worker-core";

expose(createSqliteWorkerApi({ poolName: "learn", dbPath: "/learn.db", label: "learn-worker" }));
