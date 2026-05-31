import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

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
  synced: integer("synced").default(0),
});
