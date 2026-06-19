import type { SetRow } from "../features/exerciseSets";

// Per-set progress strip: one segment per set, tinted by completion (clay = warmup,
// moss = working set). Hidden for single-set exercises.
export function SetProgressStrip({ sets }: { sets: SetRow[] }) {
  if (sets.length <= 1) return null;
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
      {sets.map((s, i) => (
        <span key={i} style={{
          flex: 1, height: 5, borderRadius: 999,
          background: s.completed
            ? (s.type === "warmup" ? "var(--clay)" : "var(--moss)")
            : "rgba(245,240,232,0.12)",
          transition: "background 0.3s ease",
        }} />
      ))}
    </div>
  );
}
