// Beep alert via Web Audio, scheduled on the hardware audio clock so the tone fires at
// an exact moment regardless of JS-thread jank or RAF throttling. unlockAudio() MUST run
// inside a user gesture (a tap) or iOS keeps the context suspended and nothing sounds.
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume();
}

export type BeepHandle = { cancel: () => void };

// Schedule a short tone (or a few) starting `inSeconds` from now. Returns a handle to
// abort the scheduled tones if the user pauses or leaves before they fire.
export function scheduleBeep(inSeconds: number, opts?: { freq?: number; count?: number }): BeepHandle {
  const c = getCtx();
  if (!c) return { cancel: () => {} };
  if (c.state === "suspended") void c.resume();
  const freq = opts?.freq ?? 880;
  const count = opts?.count ?? 2;
  const toneDur = 0.16;
  const gap = 0.1;
  const start = c.currentTime + Math.max(0, inSeconds);
  const oscs: OscillatorNode[] = [];
  for (let i = 0; i < count; i++) {
    const at = start + i * (toneDur + gap);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    // Attack/decay envelope to avoid the click of a hard start/stop.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + toneDur);
    osc.connect(gain).connect(c.destination);
    osc.start(at);
    osc.stop(at + toneDur + 0.02);
    oscs.push(osc);
  }
  return {
    cancel: () => {
      for (const osc of oscs) {
        try { osc.stop(); osc.disconnect(); } catch { /* already stopped */ }
      }
    },
  };
}
