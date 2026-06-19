// Set-row model for the exercise-detail flow: the in-memory shape of a logged set
// and the pure builders that derive rows from saved logs (today's session, last
// session template, previous-session ghost values). No React, no I/O.
import { type ExerciseLog } from "@data/repositories";

export const DEFAULT_RPE = 6;

// Resistance bands by ascending resistance (index = strength order, so it's
// comparable for progression). Standard TheraBand/CLX colors; the slug is stored in
// exercise_logs.band, the hex drives the swatch. Adjustable to other brands later.
export const BANDS: { slug: string; label: string; hex: string }[] = [
  { slug: "amarillo", label: "Amarillo", hex: "#E9D66B" },
  { slug: "rojo", label: "Rojo", hex: "#C0392B" },
  { slug: "verde", label: "Verde", hex: "#27AE60" },
  { slug: "azul", label: "Azul", hex: "#2E86C1" },
  { slug: "negro", label: "Negro", hex: "#2C3E50" },
  { slug: "plata", label: "Plata", hex: "#95A5A6" },
  { slug: "oro", label: "Oro", hex: "#D4AC0D" },
];

export const bandBySlug = (slug: string | undefined) =>
  BANDS.find(b => b.slug === slug);

export const PAIN_LABELS = [
  "Sin dolor", "Muy leve", "Leve", "Leve-mod",
  "Moderado", "Moderado", "Mod-fuerte", "Fuerte",
  "Muy fuerte", "Intenso", "Máximo",
];

export type SetType = "normal" | "warmup";

export type SetRow = {
  uid: string;       // stable React key so AnimatePresence exits the right row on delete
  type: SetType;
  value: number;
  load: number;      // kg, for weight exercises (0 = not set yet)
  band?: string;     // band color slug, for band exercises
  painDuring: number;
  completed: boolean;
  expanded: boolean;
};

let _setUid = 0;
export const newUid = () => `set-${++_setUid}`;

export function newRow(type: SetType, defaultValue: number): SetRow {
  return { uid: newUid(), type, value: defaultValue, load: 0, band: undefined, painDuring: 0, completed: false, expanded: false };
}

export function initSets(count: number, defaultValue: number): SetRow[] {
  return Array.from({ length: count }, () => newRow("normal", defaultValue));
}

// Brand-new session (no logs, no template): seed the user's configured number of
// warm-up rows on top of the prescribed working sets.
export function initSetsWithWarmup(count: number, warmupCount: number, defaultValue: number): SetRow[] {
  const warmups: SetRow[] = Array.from({ length: warmupCount }, () => newRow("warmup", defaultValue));
  return [...warmups, ...initSets(count, defaultValue)];
}

// Set index is the last segment of the log id (`${user}:${exercise}:${date}:${i}`),
// so logs land on their real set row even when completion is non-contiguous.
export function parseSetIdx(log: ExerciseLog): number {
  return Number(log.id.split(":").pop());
}

// Previous session's reps + equipment (kg / band) keyed by set index, for the ghost
// "PREVIO" column (RPE is now a per-exercise target, no longer shown per set).
export type PrevValue = { value: number; load?: number; band?: string };
export function prevByIndex(logs: ExerciseLog[], defaultValue: number): Map<number, PrevValue> {
  const map = new Map<number, PrevValue>();
  logs.forEach(log => {
    const idx = parseSetIdx(log);
    // Skip uncompleted warmup placeholders (completed_at NULL) — no real values to show.
    if (Number.isInteger(idx) && idx >= 0 && log.completed_at != null) {
      map.set(idx, { value: log.reps_done ?? defaultValue, load: log.load ?? undefined, band: log.band ?? undefined });
    }
  });
  return map;
}

function maxLoggedIdx(logs: ExerciseLog[]): number {
  return logs.reduce((m, log) => {
    const idx = parseSetIdx(log);
    return Number.isInteger(idx) && idx > m ? idx : m;
  }, -1);
}

// Resume today's session: rebuild rows (incl. type, values) from today's saved logs.
// Length covers both the prescribed count and any extra/sparse logged indices.
export function logsToSets(logs: ExerciseLog[], count: number, defaultValue: number): SetRow[] {
  const length = Math.max(count, maxLoggedIdx(logs) + 1);
  const base = initSets(length, defaultValue);
  logs.forEach(log => {
    const idx = parseSetIdx(log);
    if (Number.isInteger(idx) && idx >= 0 && idx < base.length) {
      base[idx] = {
        uid: base[idx].uid,
        type: log.set_type === "warmup" ? "warmup" : "normal",
        value: log.reps_done ?? defaultValue,
        load: log.load ?? 0,
        band: log.band ?? undefined,
        painDuring: log.pain_during ?? 0,
        // completed_at NULL = an uncompleted warmup placeholder (type kept, not done).
        completed: log.completed_at != null,
        expanded: false,
      };
    }
  });
  return base;
}

// Use the last session as a template: same number of rows and same warmup positions,
// but unchecked and at default values — the PREVIO ghost (prevByIndex) brings the
// numbers in when tapped. Falls back to the prescribed count if last session is empty.
export function templateFromLogs(logs: ExerciseLog[], count: number, defaultValue: number): SetRow[] {
  const length = Math.max(count, maxLoggedIdx(logs) + 1);
  const base = initSets(length, defaultValue);
  logs.forEach(log => {
    const idx = parseSetIdx(log);
    if (Number.isInteger(idx) && idx >= 0 && idx < base.length) {
      base[idx].type = log.set_type === "warmup" ? "warmup" : "normal";
      // Carry the band color forward as a starting point (rarely changes session to
      // session). Reps/weight stay default — the PREVIO ghost brings those in on tap.
      if (log.band != null) base[idx].band = log.band;
    }
  });
  return base;
}
