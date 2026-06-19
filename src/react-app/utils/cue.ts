// Spoken cues for the time-based exercise flow. Prefers a pre-rendered ElevenLabs clip
// (deterministic voice, gesture-safe via the shared AudioContext); falls back to the Web
// Speech API when the clip isn't loaded (fetch failed, still decoding, or file absent).
import { playClip, preloadClips } from "./sound";
import { speak } from "./speech";

const CLIPS = {
  comienza:   { url: "/audio/comienza.mp3",   text: "Comienza" },
  descanso:   { url: "/audio/descanso.mp3",   text: "Descanso" },
  completado: { url: "/audio/completado.mp3", text: "Completado" },
} as const;

export type CueName = keyof typeof CLIPS;

// Warm the clip cache. Call on mount of any screen that cues; safe before a user gesture.
export function preloadCues(): void {
  void preloadClips(Object.entries(CLIPS).map(([name, c]) => ({ name, url: c.url })));
}

// Play a cue: pre-rendered clip if available, otherwise Web Speech with the same words.
export function cue(name: CueName): void {
  if (playClip(name)) return;
  speak(CLIPS[name].text);
}
