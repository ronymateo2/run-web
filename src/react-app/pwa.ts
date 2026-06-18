// Service worker registration handle + manual update check.
// The 60s auto-update interval was removed (battery): it fetched sw.js every
// minute forever, even with the tab hidden. Updates now happen on cold launch
// (the SW's own check) plus this on-demand check from ProfileScreen.
let registration: ServiceWorkerRegistration | null = null;

export function setRegistration(reg: ServiceWorkerRegistration): void {
  registration = reg;
}

export type UpdateCheck = "updating" | "current" | "unsupported";

// "updating" → a new SW was found; with autoUpdate it skipWaiting + reloads the
// page shortly. "current" → already on the latest. "unsupported" → no SW (e.g.
// dev, or browser without SW support).
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!registration) return "unsupported";
  let found = false;
  const onFound = () => { found = true; };
  registration.addEventListener("updatefound", onFound);
  try {
    await registration.update();
  } finally {
    registration.removeEventListener("updatefound", onFound);
  }
  return found ? "updating" : "current";
}
