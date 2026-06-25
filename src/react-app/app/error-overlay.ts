// DEBUG: on-screen error overlay for mobile (no cable needed).
// Plain DOM so it renders even if the React tree crashed. Remove after debugging.
let box: HTMLDivElement | null = null;

function ensureBox(): HTMLDivElement {
  if (box) return box;
  box = document.createElement("div");
  box.style.cssText = [
    "position:fixed", "left:0", "right:0", "bottom:0", "z-index:2147483647",
    "max-height:45vh", "overflow:auto", "background:rgba(140,20,20,.96)",
    "color:#fff", "font:12px/1.4 ui-monospace,monospace", "padding:10px 12px 16px",
    "white-space:pre-wrap", "word-break:break-word", "box-shadow:0 -2px 12px rgba(0,0,0,.4)",
  ].join(";");
  box.addEventListener("click", () => { box?.remove(); box = null; });
  document.body.appendChild(box);
  return box;
}

function paint(tag: string, value: unknown): void {
  const err = value instanceof Error ? `${value.name}: ${value.message}\n${value.stack ?? ""}` : String(value);
  const line = document.createElement("div");
  line.style.cssText = "border-top:1px solid rgba(255,255,255,.25);padding:6px 0";
  line.textContent = `[${tag}] ${err}`;
  ensureBox().prepend(line);
}

export function installErrorOverlay(): void {
  window.addEventListener("unhandledrejection", (e) => paint("promise", e.reason));
  window.addEventListener("error", (e) => paint("error", e.error ?? e.message));
}
