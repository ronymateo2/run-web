// Reusable, drift-free countdown for PWA timers. The remaining time is derived from a
// fixed end timestamp (`endAt`) every frame — never accumulated tick-by-tick — so it
// stays exact even when the JS thread janks. The completion beep plays at finish() through
// an HTMLAudioElement so it survives the iOS mute switch (Web Audio obeys it). Tradeoff vs
// the old hardware-clock scheduling: the beep is tied to finish(), so if the app is
// backgrounded exactly at the end it fires when the tab returns (the visibilitychange net
// calls finish()) rather than on time — acceptable since Wake Lock keeps the screen on and
// the workout stays foreground. Wake Lock also avoids the OS backgrounding mid-timer.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { unlockAudio } from "../utils/sound";
import { preloadBeeps, unlockBeeps, playBeep, releaseBeeps } from "../utils/beep";
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
  const beepOptsRef = useRef<{ freq?: number; count?: number } | undefined>(undefined); // beep to play at finish()
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
    playBeep(beepOptsRef.current); // fire the completion beep (no-op when count<=0)
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
    beepOptsRef.current = undefined; // stopped before finish() → no beep
    releaseBeeps();                  // dismiss the lock-screen now-playing card
    setRunning(false);
    void releaseWakeLock();
  }, []);

  // `beep` lets the caller distinguish the completion tone (e.g. a higher "go" beep at the
  // end of a rest vs the default tone at the end of a set). Passed straight to scheduleBeep.
  const start = useCallback((durationSec: number, beep?: { freq?: number; count?: number }) => {
    cancelRaf();
    firedRef.current = false; // arm finish() for this run
    const wantsBeep = (beep?.count ?? 2) > 0;
    if (wantsBeep) {
      unlockAudio();  // keep the Web Audio fallback usable (beep clip missing)
      unlockBeeps();  // unlock the beep <audio> elements while we're (often) in a gesture
    }
    beepOptsRef.current = beep; // played at finish()
    durMsRef.current = durationSec * 1000;
    endAtRef.current = performance.now() + durMsRef.current;
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

  // Preload the beep clips up front so the first completion plays without a fetch stall.
  useEffect(() => { preloadBeeps(); }, []);

  // Cleanup on unmount: stop the loop, release the lock.
  useEffect(() => stop, [stop]);

  return { progress, running, start, stop, subscribe, getSeconds };
}

// Subscribe a leaf component to a countdown's remaining seconds. Only this component
// re-renders on each tick — not whichever component owns the `useCountdown` instance.
export function useCountdownSeconds(timer: Pick<ReturnType<typeof useCountdown>, "subscribe" | "getSeconds">) {
  return useSyncExternalStore(timer.subscribe, timer.getSeconds);
}
