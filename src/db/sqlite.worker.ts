// Main app database worker. Pool name stays at the library default — the user's
// existing OPFS directory lives there; naming it would orphan their data.
import { expose } from "comlink";
import { createSqliteWorkerApi } from "./sqlite-worker-core";

expose(createSqliteWorkerApi({ dbPath: "/rurana.db", label: "worker" }));
