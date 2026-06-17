// Screen Wake Lock: keep the display on while a timer runs so the OS doesn't background
// the PWA (which freezes JS and throttles timers). The sentinel is auto-released when the
// page is hidden, so the caller re-requests it on visibilitychange. No-op where
// unsupported (older iOS, etc.). Typed locally to avoid depending on lib.dom WakeLock.
type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockNav = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

let sentinel: WakeLockSentinelLike | null = null;

export async function requestWakeLock(): Promise<void> {
  const wl = (navigator as WakeLockNav).wakeLock;
  if (!wl) return;
  try {
    sentinel = await wl.request("screen");
  } catch { /* denied or page not visible — ignore */ }
}

export async function releaseWakeLock(): Promise<void> {
  try { await sentinel?.release(); } catch { /* ignore */ }
  sentinel = null;
}
