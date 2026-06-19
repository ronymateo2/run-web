// Spoken cues for the time-based exercise flow. Prefers the Web Speech API: on iOS it plays
// through the system speech channel, which IGNORES the hardware mute switch — users train
// with the phone on silent and still hear the cue. Web Audio (the pre-rendered ElevenLabs
// clip) instead OBEYS the mute switch, so it's only a fallback for browsers without speech
// synthesis. primeSpeech() (called on screen mount) keeps the first speak() in-gesture so the
// original "first play is silent" bug stays fixed.
import { playClip, preloadClips } from "./sound";
import { speak, speechSupported } from "./speech";

const CLIPS = {
  comienza:   { url: "/audio/comienza.mp3",   text: "Comienza" },
  descanso:   { url: "/audio/descanso.mp3",   text: "Descanso" },
  completado: { url: "/audio/completado.mp3", text: "Completado" },
} as const;

export type CueName = keyof typeof CLIPS;

// Warm the clip cache only when speech synthesis is missing (the clips are a fallback).
// Avoids fetching/decoding MP3s that the iOS/desktop speech path will never use.
export function preloadCues(): void {
  if (speechSupported()) return;
  void preloadClips(Object.entries(CLIPS).map(([name, c]) => ({ name, url: c.url })));
}

// Play a cue: Web Speech (mute-switch-safe on iOS) when available, else the pre-rendered clip.
export function cue(name: CueName): void {
  if (speechSupported()) { speak(CLIPS[name].text); return; }
  playClip(name);
}
