import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Ico } from "@shared/components/icons";

interface ExerciseFABProps {
  onAddSet: () => void;
  onAddWarmup: () => void;
  onGuided?: () => void;
  hasNextExercise: boolean;
  visible: boolean;
}

const springItem = { type: "spring", stiffness: 500, damping: 30 } as const;

const itemBase: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, padding: "11px 16px",
  borderRadius: "var(--r-md)", cursor: "pointer", pointerEvents: "auto",
  fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em",
  textTransform: "uppercase", boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
  backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
};

function FABItem({
  label, onClick, color, border, bg, delay, icon = "plus",
}: {
  label: string;
  onClick: () => void;
  color: string;
  border: string;
  bg: string;
  delay?: number;
  icon?: "plus" | "play";
}) {
  const Icon = icon === "play" ? Ico.play : Ico.plus;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 10, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.9 }}
      transition={{ ...springItem, delay }}
      whileTap={{ scale: 0.95 }}
      style={{ ...itemBase, border, background: bg, color }}
    >
      <Icon s={15} c={color} />
      {label}
    </motion.button>
  );
}

export function ExerciseFAB({
  onAddSet, onAddWarmup, onGuided, hasNextExercise, visible,
}: ExerciseFABProps) {
  const [fabOpen, setFabOpen] = useState(false);
  if (!visible) return null;

  const close = () => setFabOpen(false);

  return (
    <>
      <AnimatePresence>
        {fabOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={close}
            style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(17,30,22,0.35)" }}
          />
        )}
      </AnimatePresence>
      <div style={{
        position: "fixed", right: 24,
        bottom: `calc(${hasNextExercise ? 140 : 85}px + env(safe-area-inset-bottom, 0px))`,
        zIndex: 50, display: "flex", flexDirection: "column", alignItems: "flex-end",
        gap: 12, pointerEvents: "none",
      }}>
        <AnimatePresence>
          {fabOpen && (
            <>
              {onGuided && (
                <FABItem
                  key="guided"
                  label="Modo guiado"
                  icon="play"
                  onClick={() => { onGuided(); close(); }}
                  color="var(--bone)"
                  border="1px solid rgba(245,240,232,0.30)"
                  bg="rgba(31,58,46,0.92)"
                  delay={0.08}
                />
              )}
              <FABItem
                key="add-serie"
                label="Serie"
                onClick={() => { onAddSet(); close(); }}
                color="var(--moss)"
                border="1px solid rgba(138,168,140,0.35)"
                bg="rgba(20,34,26,0.92)"
                delay={0.04}
              />
              <FABItem
                key="add-warmup"
                label="Calentamiento"
                onClick={() => { onAddWarmup(); close(); }}
                color="var(--clay)"
                border="1px solid rgba(217,119,87,0.45)"
                bg="rgba(36,24,18,0.92)"
              />
            </>
          )}
        </AnimatePresence>
        <button
          type="button"
          className="press"
          aria-label={fabOpen ? "Cerrar" : "Agregar serie o calentamiento"}
          aria-expanded={fabOpen}
          onClick={() => setFabOpen((o) => !o)}
          style={{
            width: 56, height: 56, borderRadius: 999, border: "none",
            background: "var(--clay)", display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", pointerEvents: "auto", boxShadow: "0 8px 24px rgba(217,119,87,0.45)",
          }}
        >
          <span
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              transform: fabOpen ? "rotate(45deg)" : "rotate(0deg)",
              transition: "transform 0.3s var(--ease-bounce)",
            }}
          >
            <Ico.plus s={26} c="#111E16" />
          </span>
        </button>
      </div>
    </>
  );
}
