// Spoken cues for the time-based exercise flow. Plays pre-rendered MP3s through an
// HTMLAudioElement — iOS routes media-element playback to the "playback" audio session,
// which IGNORES the hardware mute switch (same path YouTube/Spotify use). Web Audio would
// obey the mute switch, so we avoid it here. Web Speech is the fallback when a clip is
// missing or playback is rejected (it also ignores the mute switch).
//
// A media element keeps the iOS lock-screen "now playing" card alive as long as it holds a
// loaded source — setting playbackState alone doesn't dismiss it. releaseCues() detaches the
// sources so the card disappears once the flow ends. We only release at terminal points (the
// final cue, stop, unmount), never between repeating cues, so a reused element stays unlocked
// for the no-gesture cues fired from the timer callback.
import { speak } from "./speech";
import { clearNowPlaying } from "./sound";

const CLIPS = {
  comienza:   { url: "/audio/comienza.mp3",   text: "Comienza" },
  descanso:   { url: "/audio/descanso.mp3",   text: "Descanso" },
  completado: { url: "/audio/completado.mp3", text: "Completado" },
} as const;

export type CueName = keyof typeof CLIPS;

const elements = new Map<CueName, HTMLAudioElement>();

// Make sure the element has its source attached (releaseCues() detaches it).
function ensureSrc(name: CueName, el: HTMLAudioElement): void {
  if (!el.getAttribute("src")) el.src = CLIPS[name].url;
}

// Create + preload one <audio> element per cue. Safe before a user gesture.
export function preloadCues(): void {
  if (typeof Audio === "undefined") return;
  for (const name of Object.keys(CLIPS) as CueName[]) {
    if (elements.has(name)) continue;
    const el = new Audio(CLIPS[name].url);
    el.preload = "auto";
    el.load();
    elements.set(name, el);
  }
}

// iOS gates HTMLMediaElement playback behind a user gesture per element. Call this from the
// play tap so the cues fired later from the timer callback (Descanso/Completado, no gesture)
// can still play. Plays each element at volume 0 to unlock it inaudibly, then resets.
export function unlockCues(): void {
  for (const [name, el] of elements) {
    if (!el.paused) continue;
    ensureSrc(name, el);
    el.volume = 0;
    const p = el.play();
    if (p) {
      p.then(() => { el.pause(); el.currentTime = 0; el.volume = 1; })
       .catch(() => { el.volume = 1; });
    }
  }
}

// Detach every cue's source so the iOS lock-screen now-playing card is dismissed. Call at
// terminal points only (final cue ended, stop, unmount) — never between repeating cues.
export function releaseCues(): void {
  for (const el of elements.values()) {
    el.pause();
    el.removeAttribute("src");
    el.load();
  }
  clearNowPlaying();
}

// Play a cue: the MP3 if its element is ready, otherwise Web Speech. Pass final=true for the
// terminal cue (nothing plays after it) so the now-playing card is released once it ends.
export function cue(name: CueName, final = false): void {
  const el = elements.get(name);
  if (el) {
    ensureSrc(name, el);
    el.currentTime = 0;
    el.volume = 1;
    if (final) el.addEventListener("ended", releaseCues, { once: true });
    const p = el.play();
    if (p) p.catch(() => speak(CLIPS[name].text)); // not unlocked / failed → fall back
    return;
  }
  speak(CLIPS[name].text);
}
