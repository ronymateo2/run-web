// Beep alert via Web Audio, scheduled on the hardware audio clock so the tone fires at
// an exact moment regardless of JS-thread jank or RAF throttling. unlockAudio() MUST run
// inside a user gesture (a tap) or iOS keeps the context suspended and nothing sounds.
// The context is suspended again shortly after the last scheduled tone so it doesn't keep
// the audio render thread awake (battery) once no timer is active.
let ctx: AudioContext | null = null;
let suspendTimer: ReturnType<typeof setTimeout> | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

function clearSuspend(): void {
  if (suspendTimer) { clearTimeout(suspendTimer); suspendTimer = null; }
}

// Suspend the context once the audio clock passes `atCtxTime` (the end of the last tone),
// unless something resumed it in the meantime. Bounds "running" to the active window.
function scheduleSuspend(atCtxTime: number): void {
  const c = ctx;
  if (!c) return;
  clearSuspend();
  const ms = Math.max(0, (atCtxTime - c.currentTime) * 1000) + 400;
  suspendTimer = setTimeout(() => {
    suspendTimer = null;
    if (ctx && ctx.state === "running" && ctx.currentTime >= atCtxTime) void ctx.suspend();
  }, ms);
}

export function unlockAudio(): void {
  const c = getCtx();
  if (!c) return;
  clearSuspend(); // a new timer is starting — keep the clock running
  if (c.state === "suspended") void c.resume();
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
  let lastEnd = start;
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
    lastEnd = at + toneDur + 0.02;
    osc.stop(lastEnd);
    // Free the node graph once it's done so oscillators don't pile up.
    osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch { /* noop */ } };
    oscs.push(osc);
  }
  scheduleSuspend(lastEnd);
  return {
    cancel: () => {
      for (const osc of oscs) {
        try { osc.onended = null; osc.stop(); osc.disconnect(); } catch { /* already stopped */ }
      }
      // Nothing left to play — let the context idle down.
      if (ctx) scheduleSuspend(ctx.currentTime);
    },
  };
}
