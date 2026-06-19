import { Ico } from "@shared/components/icons";
import type { Exercise } from "@data/repositories";

// Protocol chips: constants across sets (hold target per rep, target RPE), so they
// sit above the table instead of in each row. Renders nothing if neither applies.
export function ProtocolChips({
  exercise, isTimeBased, onEditRpe,
}: {
  exercise: Exercise;
  isTimeBased: boolean;
  onEditRpe: () => void;
}) {
  if (!((!isTimeBased && !!exercise.duration_s) || exercise.target_rpe != null)) return null;
  return (
    <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
      {!isTimeBased && !!exercise.duration_s && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.04em",
          color: "rgba(245,240,232,0.78)",
          padding: "6px 12px",
          borderRadius: 999,
          background: "rgba(245,240,232,0.05)",
          border: "1px solid rgba(245,240,232,0.10)",
        }}>
          <Ico.timer s={14} c="rgba(245,240,232,0.78)" />
          Mantén <strong style={{ fontWeight: 700 }}>{exercise.duration_s}s</strong> por rep
        </span>
      )}
      {exercise.target_rpe != null && (
        <button
          onClick={onEditRpe}
          aria-label={`RPE objetivo ${exercise.target_rpe}. Editar.`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
            fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.04em",
            color: "rgba(245,240,232,0.78)",
            padding: "6px 12px",
            borderRadius: 999,
            background: "rgba(245,240,232,0.05)",
            border: "1px solid rgba(245,240,232,0.10)",
          }}
        >
          RPE objetivo <strong style={{ fontWeight: 700 }}>{exercise.target_rpe}</strong>
          <Ico.pencil s={12} c="rgba(245,240,232,0.55)" />
        </button>
      )}
    </div>
  );
}
