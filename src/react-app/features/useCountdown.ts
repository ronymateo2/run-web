// Reusable, drift-free countdown for PWA timers. The remaining time is derived from a
// fixed end timestamp (`endAt`) every frame — never accumulated tick-by-tick — so it
// stays exact even when the JS thread janks. The completion beep is scheduled on the
// Web Audio clock at start, so it fires precisely even if RAF gets throttled in the
// background; the visual just catches up on the next visible frame. Wake Lock keeps the
// screen on to avoid the OS backgrounding the page mid-timer.
import { useCallback, useEffect, useRef, useState } from "react";
import { unlockAudio, scheduleBeep, type BeepHandle } from "../utils/sound";
import { requestWakeLock, releaseWakeLock } from "../utils/wakeLock";

// `smooth` (default): update `progress` every frame for a fluid ring. Pass smooth=false
// when only the integer `secondsLeft` is shown (e.g. a list of set rows) — then state
// only changes once per second, so the consuming component re-renders ~1Hz instead of
// 60fps. `progress` is only meaningful when smooth.
export function useCountdown(
  { onComplete, smooth = true }: { onComplete?: () => void; smooth?: boolean } = {},
) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [progress, setProgress] = useState(0); // 0..1 elapsed fraction
  const [running, setRunning] = useState(false);

  const endAtRef = useRef(0);
  const durMsRef = useRef(0);
  const lastSecRef = useRef(-1); // last integer second pushed to state — gate re-renders
  const rafRef = useRef<number | null>(null);
  const beepRef = useRef<BeepHandle | null>(null);
  // Keep the latest callback without re-subscribing effects or re-creating start/stop.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const cancelRaf = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const finish = useCallback(() => {
    cancelRaf();
    beepRef.current = null; // already scheduled on the audio clock — let it ring
    setRunning(false);
    setSecondsLeft(0);
    setProgress(1);
    void releaseWakeLock();
    onCompleteRef.current?.();
  }, []);

  const tick = useCallback(() => {
    const remaining = endAtRef.current - performance.now();
    if (remaining <= 0) { finish(); return; }
    const secs = Math.ceil(remaining / 1000);
    if (secs !== lastSecRef.current) {
      lastSecRef.current = secs;
      setSecondsLeft(secs);
    }
    if (smooth) setProgress(durMsRef.current > 0 ? 1 - remaining / durMsRef.current : 0);
    rafRef.current = requestAnimationFrame(tick);
  }, [finish, smooth]);

  const stop = useCallback(() => {
    cancelRaf();
    beepRef.current?.cancel();
    beepRef.current = null;
    setRunning(false);
    void releaseWakeLock();
  }, []);

  // `beep` lets the caller distinguish the completion tone (e.g. a higher "go" beep at the
  // end of a rest vs the default tone at the end of a set). Passed straight to scheduleBeep.
  const start = useCallback((durationSec: number, beep?: { freq?: number; count?: number }) => {
    cancelRaf();
    beepRef.current?.cancel();
    unlockAudio();
    durMsRef.current = durationSec * 1000;
    endAtRef.current = performance.now() + durMsRef.current;
    beepRef.current = scheduleBeep(durationSec, beep);
    void requestWakeLock();
    setRunning(true);
    lastSecRef.current = durationSec;
    setSecondsLeft(durationSec);
    setProgress(0);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  // Background safety net: RAF pauses while hidden. On return, re-acquire the wake lock
  // and either fire completion (if the end time already passed) or resume the visual.
  useEffect(() => {
    function onVis() {
      if (!running) return;
      if (document.visibilityState === "hidden") { cancelRaf(); return; }
      void requestWakeLock();
      if (performance.now() >= endAtRef.current) finish();
      else if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [running, finish, tick]);

  // Cleanup on unmount: stop the loop, cancel the scheduled beep, release the lock.
  useEffect(() => stop, [stop]);

  return { secondsLeft, progress, running, start, stop };
}
