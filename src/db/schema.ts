import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique(),
  name: text("name"),
  avatar_url: text("avatar_url"),
  jwt: text("jwt"),
  timezone: text("timezone"),
  last_sync: integer("last_sync").default(0),
  created_at: integer("created_at"),
});

export const userAuthProviders = sqliteTable("user_auth_providers", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  provider: text("provider").notNull(),
  provider_sub: text("provider_sub").notNull(),
});

export const injuries = sqliteTable("injuries", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  name: text("name").notNull(),
  zone: text("zone").notNull(),
  status: text("status", { enum: ["active", "paused", "completed"] }).notNull().default("active"),
  current_phase_id: text("current_phase_id"),
  focus_days: text("focus_days"),
  started_at: integer("started_at"),
  synced: integer("synced").default(0),
});

export const phases = sqliteTable("phases", {
  id: text("id").primaryKey(),
  injury_id: text("injury_id").notNull(),
  phase_num: integer("phase_num").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  week_start: integer("week_start").notNull(),
  week_end: integer("week_end").notNull(),
  threshold_pct: integer("threshold_pct").notNull().default(70),
  focus_days: text("focus_days"),
  deleted_at: integer("deleted_at"),
  synced: integer("synced").default(0),
});

export const phaseCriteria = sqliteTable("phase_criteria", {
  id: text("id").primaryKey(),
  phase_id: text("phase_id").notNull(),
  description: text("description").notNull(),
  done: integer("done").notNull().default(0),
  deleted_at: integer("deleted_at"),
});

export const exercises = sqliteTable("exercises", {
  id: text("id").primaryKey(),
  phase_id: text("phase_id").notNull(),
  name: text("name").notNull(),
  detail: text("detail"),
  sets: integer("sets"),
  reps: integer("reps"),
  duration_s: integer("duration_s"),
  exercise_type: text("exercise_type", {
    enum: ["isometric", "strength", "mobility", "cardio"],
  }).notNull(),
  sort_order: integer("sort_order").default(0),
  video_url: text("video_url"),
  synced: integer("synced").default(0),
});

export const painCheckins = sqliteTable("pain_checkins", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  injury_id: text("injury_id"),
  date: text("date").notNull(),
  zones: text("zones").notNull(),
  created_at: integer("created_at"),
  deleted_at: integer("deleted_at"),
  synced: integer("synced").default(0),
});

export const exerciseLogs = sqliteTable("exercise_logs", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  exercise_id: text("exercise_id").notNull(),
  session_date: text("session_date").notNull(),
  reps_done: integer("reps_done"),
  pain_during: integer("pain_during"),
  rpe: integer("rpe"),
  note: text("note"),
  // Warmup rows ('warmup') are saved but excluded from the rollup / phase progress.
  set_type: text("set_type", { enum: ["normal", "warmup"] }).notNull().default("normal"),
  completed_at: integer("completed_at"),
  // Soft delete: deselected sets keep their row with deleted_at set; re-checking nulls it.
  deleted_at: integer("deleted_at"),
  synced: integer("synced").default(0),
});

export const sstResults = sqliteTable("sst_results", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  injury_id: text("injury_id").notNull(),
  date: text("date").notNull(),
  strength_score: real("strength_score"),
  pain_score: integer("pain_score"),
  note: text("note"),
  deleted_at: integer("deleted_at"),
  synced: integer("synced").default(0),
});

// Validated outcome questionnaires (SPADI, HAGOS). Seeded in D1, pulled as a global
// reference table (no user scope). `questions` is a JSON [{id,text}]; the scorer reads
// max_per_item/invert to normalise any instrument to 0-100. Read-only on the client.
export const promInstruments = sqliteTable("prom_instruments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  zones: text("zones").notNull(),
  questions: text("questions").notNull(),
  max_per_item: integer("max_per_item").notNull(),
  invert: integer("invert").notNull().default(0),
  better_is_higher: integer("better_is_higher").notNull().default(0),
  every_days: integer("every_days").notNull().default(14),
  sort_order: integer("sort_order").default(0),
});

export const promResults = sqliteTable("prom_results", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  injury_id: text("injury_id").notNull(),
  instrument_id: text("instrument_id").notNull(),
  date: text("date").notNull(),
  score: real("score"),
  answers: text("answers"),
  note: text("note"),
  deleted_at: integer("deleted_at"),
  synced: integer("synced").default(0),
});

// Server-derived rollup: count of non-deleted sets per (exercise, day). Drives all
// phase progress / gating / calendar reads so raw exercise_logs can be windowed
// without losing all-time correctness. Never pushed — the server is authoritative.
export const logDayCounts = sqliteTable(
  "log_day_counts",
  {
    user_id: text("user_id").notNull(),
    exercise_id: text("exercise_id").notNull(),
    session_date: text("session_date").notNull(),
    sets: integer("sets").notNull().default(0),
  },
  (t) => ({ pk: primaryKey({ columns: [t.user_id, t.exercise_id, t.session_date] }) }),
);
