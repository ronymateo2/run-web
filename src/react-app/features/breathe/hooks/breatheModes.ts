// Data-driven breathing engine. A mode is just an ordered list of phases; the player loops
// the list until the session time runs out — there is no per-mode logic anywhere. Each phase
// carries the `scale` the guide circle animates to over `seconds`, so visuals are data too.
// No backend: the chosen config lives in localStorage.

export type PhaseKind = "inhale" | "hold" | "exhale" | "sip";

export type Phase = {
  kind: PhaseKind;
  label: string;   // shown on screen + spoken (TTS) at phase start
  seconds: number;
  scale: number;   // target circle scale (0..1) reached over `seconds`
};

export type BreatheMode = {
  slug: string;
  name: string;
  tag: "easy" | "hard";
  blurb: string;
  phases: Phase[];
};

const MIN = 0.45; // fully exhaled circle
const MAX = 1;    // fully inhaled circle

const inhale = (seconds: number, scale = MAX): Phase => ({ kind: "inhale", label: "Inhala", seconds, scale });
const exhale = (seconds: number): Phase => ({ kind: "exhale", label: "Exhala", seconds, scale: MIN });
// `hold` keeps the previous phase's scale (no visual move); caller passes which extreme to hold at.
const hold = (seconds: number, scale: number): Phase => ({ kind: "hold", label: "Aguanta", seconds, scale });

// The 8 modes from the reference. Labels/blurbs in Spanish neutro (UI strings).
export const MODES: BreatheMode[] = [
  { slug: "coherent", name: "Coherente", tag: "easy", blurb: "Cinco y cinco. La claridad permanece.",
    phases: [inhale(5), exhale(5)] },
  { slug: "resonant", name: "Resonante", tag: "easy", blurb: "Cuatro y seis. Encuentra resonancia.",
    phases: [inhale(4), exhale(6)] },
  { slug: "equal", name: "Igual", tag: "easy", blurb: "Seis y seis. El balance se mantiene.",
    phases: [inhale(6), exhale(6)] },
  { slug: "slow", name: "Lenta", tag: "easy", blurb: "Seis y ocho. El ritmo baja solo.",
    phases: [inhale(6), exhale(8)] },
  { slug: "extended", name: "Extendida", tag: "hard", blurb: "Cuatro y ocho. La exhalación toma control.",
    phases: [inhale(4), exhale(8)] },
  { slug: "boxed", name: "Caja", tag: "hard", blurb: "Cuatro por lado. Estructura y atención.",
    phases: [inhale(4), hold(4, MAX), exhale(4), hold(4, MIN)] },
  { slug: "reset", name: "Reinicio", tag: "hard", blurb: "Ciclos rápidos. El sistema se reinicia.",
    phases: [inhale(2), exhale(2)] },
  { slug: "sigh", name: "Suspiro", tag: "hard", blurb: "Doble inhalación, alivio largo.",
    phases: [inhale(3, 0.78), { kind: "sip", label: "Llena", seconds: 1, scale: MAX }, exhale(6)] },
];

export function modeBySlug(slug: string): BreatheMode {
  return MODES.find((m) => m.slug === slug) ?? MODES[0];
}

// Soft cue tone per phase kind — inhale rises, exhale falls (subconscious direction cue).
export function toneFor(kind: PhaseKind): { freq: number; count: number } {
  if (kind === "inhale" || kind === "sip") return { freq: 660, count: 1 };
  if (kind === "exhale") return { freq: 440, count: 1 };
  return { freq: 550, count: 1 }; // hold
}

// Session durations offered in setup (seconds).
export const DURATIONS = [30, 60, 120, 180, 300, 600];

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type BreatheConfig = {
  modeSlug: string;
  durationSec: number;
  sound: boolean;
  voice: boolean;
};

const STORAGE_KEY = "rurana_breathe";
const DEFAULT_CONFIG: BreatheConfig = { modeSlug: "coherent", durationSec: 120, sound: true, voice: false };

export function loadConfig(): BreatheConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<BreatheConfig>;
    return {
      modeSlug: modeBySlug(parsed.modeSlug ?? DEFAULT_CONFIG.modeSlug).slug,
      durationSec: DURATIONS.includes(parsed.durationSec as number) ? (parsed.durationSec as number) : DEFAULT_CONFIG.durationSec,
      sound: parsed.sound ?? DEFAULT_CONFIG.sound,
      voice: parsed.voice ?? DEFAULT_CONFIG.voice,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(cfg: BreatheConfig): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch { /* storage full / disabled */ }
}
