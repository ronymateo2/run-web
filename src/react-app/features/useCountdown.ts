// Reusable, drift-free countdown for PWA timers. The remaining time is derived from a
// fixed end timestamp (`endAt`) every frame — never accumulated tick-by-tick — so it
// stays exact even when the JS thread janks. The completion beep is scheduled on the
// Web Audio clock at start, so it fires precisely even if RAF gets throttled in the
// background; the visual just catches up on the next visible frame. Wake Lock keeps the
// screen on to avoid the OS backgrounding the page mid-timer.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { unlockAudio, scheduleBeep, type BeepHandle } from "../utils/sound";
import { requestWakeLock, releaseWakeLock } from "../utils/wakeLock";

// `smooth` (default): update `progress` every frame for a fluid ring. Pass smooth=false
// when only the integer seconds are shown — then `progress` only changes on start/finish.
//
// The remaining seconds are NOT React state: they live in a ref + a pub/sub (`subscribe`
// / `getSeconds`). The component that *calls* this hook therefore never re-renders on a
// tick — only the leaf that reads the value via `useCountdownSeconds` does. That keeps a
// 1Hz timer from re-rendering an entire list of rows once per second.
export function useCountdown(
  { onComplete, smooth = true }: { onComplete?: () => void; smooth?: boolean } = {},
) {
  const [progress, setProgress] = useState(0); // 0..1 elapsed fraction
  const [running, setRunning] = useState(false);

  // Remaining seconds as an external store: a ref + a set of subscribers. Bumping it
  // notifies only the leaf components reading it, never the hook's owner component.
  const secondsRef = useRef(0);
  const listenersRef = useRef(new Set<() => void>());
  const subscribe = useCallback((cb: () => void) => {
    listenersRef.current.add(cb);
    return () => { listenersRef.current.delete(cb); };
  }, []);
  const getSeconds = useCallback(() => secondsRef.current, []);
  const setSeconds = useCallback((v: number) => {
    if (secondsRef.current === v) return;
    secondsRef.current = v;
    listenersRef.current.forEach(cb => cb());
  }, []);

  const endAtRef = useRef(0);
  const durMsRef = useRef(0);
  const lastSecRef = useRef(-1); // last integer second pushed — gate notifications
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false); // guards finish() to one onComplete per run (RAF vs visibilitychange race)
  const beepRef = useRef<BeepHandle | null>(null);
  // Keep the latest callback without re-subscribing effects or re-creating start/stop.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const cancelRaf = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const finish = useCallback(() => {
    if (firedRef.current) return; // already finished this run — ignore the second caller
    firedRef.current = true;
    cancelRaf();
    beepRef.current = null; // already scheduled on the audio clock — let it ring
    setRunning(false);
    setSeconds(0);
    setProgress(1);
    void releaseWakeLock();
    onCompleteRef.current?.();
  }, [setSeconds]);

  const tick = useCallback(() => {
    const remaining = endAtRef.current - performance.now();
    if (remaining <= 0) { finish(); return; }
    const secs = Math.ceil(remaining / 1000);
    if (secs !== lastSecRef.current) {
      lastSecRef.current = secs;
      setSeconds(secs);
    }
    if (smooth) setProgress(durMsRef.current > 0 ? 1 - remaining / durMsRef.current : 0);
    rafRef.current = requestAnimationFrame(tick);
  }, [finish, smooth, setSeconds]);

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
    firedRef.current = false; // arm finish() for this run
    unlockAudio();
    durMsRef.current = durationSec * 1000;
    endAtRef.current = performance.now() + durMsRef.current;
    beepRef.current = scheduleBeep(durationSec, beep);
    void requestWakeLock();
    setRunning(true);
    lastSecRef.current = durationSec;
    setSeconds(durationSec);
    setProgress(0);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick, setSeconds]);

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

  return { progress, running, start, stop, subscribe, getSeconds };
}

// Subscribe a leaf component to a countdown's remaining seconds. Only this component
// re-renders on each tick — not whichever component owns the `useCountdown` instance.
export function useCountdownSeconds(timer: Pick<ReturnType<typeof useCountdown>, "subscribe" | "getSeconds">) {
  return useSyncExternalStore(timer.subscribe, timer.getSeconds);
}
