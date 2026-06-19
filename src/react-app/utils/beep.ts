// Completion beeps played through HTMLAudioElements so they survive the iOS mute switch
// (Web Audio obeys it; media-element playback ignores it — same reason as the voice cues).
// Falls back to the Web Audio oscillator if a matching clip is missing.
import { scheduleBeep, clearNowPlaying } from "./sound";

// freq×count → pre-rendered tone (see scripts/gen-beep.mjs). Keep in sync with the
// scheduleBeep() call sites.
const FILES: Record<string, string> = {
  "880x2": "/audio/beep-880x2.mp3",
  "1320x3": "/audio/beep-1320x3.mp3",
};

const els = new Map<string, HTMLAudioElement>();
const keyOf = (freq: number, count: number) => `${freq}x${count}`;

// Create + preload one <audio> per beep variant. Safe before a user gesture.
export function preloadBeeps(): void {
  if (typeof Audio === "undefined") return;
  for (const [k, url] of Object.entries(FILES)) {
    if (els.has(k)) continue;
    const el = new Audio(url);
    el.preload = "auto";
    el.addEventListener("ended", clearNowPlaying); // drop the lock-screen card when done
    el.load();
    els.set(k, el);
  }
}

// Unlock the beep elements inside a user gesture so a beep fired later from the timer
// callback (no gesture) can play. Plays at volume 0 to unlock inaudibly, then resets.
export function unlockBeeps(): void {
  for (const el of els.values()) {
    if (!el.paused) continue;
    el.volume = 0;
    const p = el.play();
    if (p) {
      p.then(() => { el.pause(); el.currentTime = 0; el.volume = 1; })
       .catch(() => { el.volume = 1; });
    }
  }
}

// Play the completion beep now. count<=0 = no beep (caller uses a voice cue instead).
// Missing clip → Web Audio fallback (which obeys the mute switch).
export function playBeep(opts?: { freq?: number; count?: number }): void {
  const freq = opts?.freq ?? 880;
  const count = opts?.count ?? 2;
  if (count <= 0) return;
  const el = els.get(keyOf(freq, count));
  if (el) {
    el.currentTime = 0;
    el.volume = 1;
    const p = el.play();
    if (p) p.catch(() => scheduleBeep(0, opts)); // not unlocked / failed → fall back
    return;
  }
  scheduleBeep(0, opts);
}
