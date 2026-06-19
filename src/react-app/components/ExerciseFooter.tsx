import { motion } from "motion/react";
import { Ico } from "./icons";
import type { Exercise } from "../../data/repositories";

// Fixed footer for the exercise-detail screen: optional "next exercise" shortcut above
// the primary save button.
export function ExerciseFooter({
  nextExercise, saving, canSave, saveLabel, completedCount, onNext, onSave,
}: {
  nextExercise: Exercise | null;
  saving: boolean;
  canSave: boolean;
  saveLabel: string;
  completedCount: number;
  onNext: () => void;
  onSave: () => void;
}) {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      padding: "20px 24px calc(20px + env(safe-area-inset-bottom, 0px))",
      background: "linear-gradient(to top, #111E16 60%, transparent)",
      pointerEvents: "none",
    }}>
      {nextExercise && (
        <motion.button
          onClick={onNext}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            padding: "12px 16px",
            marginBottom: 12,
            background: "rgba(245,240,232,0.08)",
            border: "1px solid rgba(245,240,232,0.12)",
            borderRadius: 12,
            cursor: "pointer",
            pointerEvents: "auto",
          }}
        >
          <span style={{
            fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.1em",
            color: "rgba(245,240,232,0.50)", textTransform: "uppercase",
          }}>
            Siguiente
          </span>
          <span style={{
            fontSize: 13,
            color: "var(--bone)",
            fontWeight: 500,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {nextExercise.name}
          </span>
          <Ico.arrow s={16} c="var(--bone)" />
        </motion.button>
      )}
      <motion.button
        className="btn-pill"
        onClick={onSave}
        disabled={saving || !canSave}
        whileTap={canSave && !saving ? { scale: 0.97 } : {}}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        style={{
          opacity: !canSave ? 0.35 : 1,
          pointerEvents: "auto",
        }}
      >
        {saveLabel}
        {!saving && completedCount > 0 && <Ico.check s={16} c="var(--bone)" />}
      </motion.button>
    </div>
  );
}
