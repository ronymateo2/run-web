// Bottom sheet to pick a resistance band color for a set. Lists the BANDS palette by
// ascending resistance; tapping a swatch selects it and closes. Purely presentational.
import { BottomSheet } from "@shared/components/BottomSheet";
import { BANDS } from "../hooks/exerciseSets";

export function BandPicker({
  selected,
  onSelect,
  onClose,
}: {
  selected: string | undefined;
  onSelect: (slug: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet variant="dark" onClose={onClose}>
      {(close) => (
        <div style={{ padding: "8px 16px calc(20px + env(safe-area-inset-bottom, 0px))" }}>
          <div style={{
            fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.12em",
            color: "rgba(245,240,232,0.55)", textTransform: "uppercase", marginBottom: 14,
          }}>
            Color de banda
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {BANDS.map((b) => {
              const active = b.slug === selected;
              return (
                <button
                  key={b.slug}
                  onClick={() => { onSelect(b.slug); close(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "12px 14px", borderRadius: 12, cursor: "pointer",
                    background: active ? "rgba(245,240,232,0.10)" : "rgba(245,240,232,0.04)",
                    border: `1px solid ${active ? "rgba(245,240,232,0.30)" : "rgba(245,240,232,0.09)"}`,
                    textAlign: "left",
                  }}
                >
                  <span style={{
                    width: 26, height: 26, borderRadius: 999, flexShrink: 0,
                    background: b.hex, border: "1px solid rgba(245,240,232,0.25)",
                  }} />
                  <span style={{ flex: 1, fontSize: 15, color: "var(--bone)" }}>{b.label}</span>
                  {active && (
                    <svg width="17" height="13" viewBox="0 0 16 12" fill="none">
                      <path d="M1 6L5.5 10.5L15 1.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
