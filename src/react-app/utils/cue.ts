// Spoken cues for the time-based exercise flow. Plays pre-rendered ElevenLabs MP3s through
// an HTMLAudioElement — iOS routes media-element playback to the "playback" audio session,
// which IGNORES the hardware mute switch (same path YouTube/Spotify use). Web Audio would
// obey the mute switch, so we deliberately avoid it here. Web Speech is the fallback when a
// clip is missing or playback is rejected (it also ignores the mute switch).
import { speak } from "./speech";
import { clearNowPlaying } from "./sound";

const CLIPS = {
  comienza:   { url: "/audio/comienza.mp3",   text: "Comienza" },
  descanso:   { url: "/audio/descanso.mp3",   text: "Descanso" },
  completado: { url: "/audio/completado.mp3", text: "Completado" },
} as const;

export type CueName = keyof typeof CLIPS;

const elements = new Map<CueName, HTMLAudioElement>();

// Create + preload one <audio> element per cue. Safe before a user gesture (loading the
// media doesn't need one — only playback does). Idempotent.
export function preloadCues(): void {
  if (typeof Audio === "undefined") return;
  for (const [name, c] of Object.entries(CLIPS) as [CueName, (typeof CLIPS)[CueName]][]) {
    if (elements.has(name)) continue;
    const el = new Audio(c.url);
    el.preload = "auto";
    // Drop the lock-screen now-playing card as soon as the clip finishes.
    el.addEventListener("ended", clearNowPlaying);
    el.load();
    elements.set(name, el);
  }
}

// iOS gates HTMLMediaElement playback behind a user gesture per element. Call this from the
// play tap so the cues fired later from the timer callback (Descanso/Completado, no gesture)
// can still play. Plays each element at volume 0 to unlock it inaudibly, then resets.
export function unlockCues(): void {
  for (const el of elements.values()) {
    // An element already playing (e.g. the in-gesture "comienza" cue) is self-unlocked;
    // touching it would abort that playback via the deferred pause below.
    if (!el.paused) continue;
    el.volume = 0;
    const p = el.play();
    if (p) {
      p.then(() => { el.pause(); el.currentTime = 0; el.volume = 1; })
       .catch(() => { el.volume = 1; });
    }
  }
}

// Play a cue: the MP3 if its element is ready, otherwise Web Speech with the same words.
export function cue(name: CueName): void {
  const el = elements.get(name);
  if (el) {
    el.currentTime = 0;
    el.volume = 1;
    const p = el.play();
    if (p) p.catch(() => speak(CLIPS[name].text)); // not unlocked / failed to load → fall back
    return;
  }
  speak(CLIPS[name].text);
}
