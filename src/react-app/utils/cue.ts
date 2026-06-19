// Spoken cues for the time-based exercise flow, via the Web Speech API. On iOS this plays
// through the system speech channel: it IGNORES the hardware mute switch (audible when the
// phone is on silent) AND it registers no MediaSession, so it leaves no lock-screen
// "now playing" card — unlike HTMLAudioElement playback, which iOS treats as media and shows
// (stickily) on the lock screen. The pre-rendered MP3 clips were dropped for that reason;
// the trade is the OS voice instead of a fixed one.
import { speak, primeSpeech } from "./speech";

const TEXT = {
  comienza: "Comienza",
  descanso: "Descanso",
  completado: "Completado",
} as const;

export type CueName = keyof typeof TEXT;

// Warm the voice list so the first cue speaks synchronously inside the play tap (a deferred
// utterance loses the gesture → blocked silently on iOS). Call on mount.
export function preloadCues(): void {
  primeSpeech();
}

// No-ops kept so callers don't change: TTS needs no per-element unlock or release, and it
// never leaves a now-playing card to clear.
export function unlockCues(): void { /* noop — TTS needs no media-element unlock */ }
export function releaseCues(): void { /* noop — TTS leaves no now-playing card */ }

// Speak a cue. The `final` flag is accepted for call-site compatibility but unused (no card).
export function cue(name: CueName, _final = false): void {
  speak(TEXT[name]);
}
