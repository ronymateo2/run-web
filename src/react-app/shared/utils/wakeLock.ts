// Screen Wake Lock: keep the display on while a timer runs so the OS doesn't background
// the PWA (which freezes JS and throttles timers). Idempotent — only one sentinel is ever
// held, so repeated requests (e.g. phase transitions) don't orphan a previous lock. The OS
// auto-releases on page hide; the 'release' listener clears our ref so the caller can
// re-acquire on the next visibilitychange. No-op where unsupported (older iOS, etc.).
// Typed locally to avoid depending on lib.dom WakeLock.
type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener?: (type: "release", cb: () => void) => void;
};
type WakeLockNav = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

let sentinel: WakeLockSentinelLike | null = null;
let requesting = false;

export async function requestWakeLock(): Promise<void> {
  const wl = (navigator as WakeLockNav).wakeLock;
  if (!wl || sentinel || requesting) return; // already held or in-flight
  requesting = true;
  try {
    const s = await wl.request("screen");
    sentinel = s;
    s.addEventListener?.("release", () => { if (sentinel === s) sentinel = null; });
  } catch { /* denied or page not visible — ignore */ }
  finally { requesting = false; }
}

export async function releaseWakeLock(): Promise<void> {
  const s = sentinel;
  sentinel = null;
  try { await s?.release(); } catch { /* ignore */ }
}
