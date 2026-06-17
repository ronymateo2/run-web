// One set row in the exercise-detail list: swipe-to-delete, completion check, the
// previous-session ghost chip (tap to copy value+RPE), reps/RPE metric cells, and the
// expandable pain panel with copy-to-following. Purely presentational — all state
// lives in useExerciseSession and is passed down by index.
import { AnimatePresence, motion } from "motion/react";
import { ArrowLineDown, ClockCounterClockwise, Palette, Trash } from "@phosphor-icons/react";
import { Ico } from "./icons";
import { EditableNum } from "./EditableNum";
import { PAIN_LABELS, bandBySlug, type SetRow, type PrevValue } from "../features/exerciseSets";

export type EquipmentType = "none" | "weight" | "band";

export function SetCard({
  row, i, workingNum, isTimeBased, isLast, prevForRow, equipmentType, swiped,
  timing = false, timerSecondsLeft,
  onSwipe, onDragStart, onToggleCompleted, onToggleExpand, onUpdate, onOpenBand, onCopyPrev, onCopyFollowing, onRemove,
  onStartTimer, onStopTimer,
}: {
  row: SetRow;
  i: number;
  workingNum: number;
  isTimeBased: boolean;
  isLast: boolean;
  prevForRow: PrevValue | undefined;
  equipmentType: EquipmentType;
  swiped: boolean;
  timing?: boolean;
  timerSecondsLeft?: number;
  onSwipe: (uid: string | null) => void;
  onDragStart: () => void;
  onToggleCompleted: (i: number) => void;
  onToggleExpand: (i: number) => void;
  onUpdate: (i: number, field: "value" | "load" | "painDuring", val: number) => void;
  onOpenBand: (i: number) => void;
  onCopyPrev: (i: number, prev: PrevValue) => void;
  onCopyFollowing: (i: number) => void;
  onRemove: (i: number) => void;
  onStartTimer?: (i: number) => void;
  onStopTimer?: () => void;
}) {
  const isWarmup = row.type === "warmup";
  const accent = isWarmup ? "217,119,87" : "138,168,140"; // clay : moss
  const prevBand = bandBySlug(prevForRow?.band);
  const rowBand = bandBySlug(row.band);

  return (
    <motion.div
      key={row.uid}
      layout
      exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.2 } }}
      style={{ position: "relative", marginBottom: 10, borderRadius: "var(--r-md)", overflow: "hidden" }}
    >
      {/* Red layer revealed when the card is swiped left → tap to delete */}
      <div
        role="button"
        onClick={() => {
          if (swiped) {
            onSwipe(null);
            onRemove(i);
          }
        }}
        style={{
          position: "absolute", inset: 0,
          background: "#B0532F",
          cursor: swiped ? "pointer" : "default",
        }}
      >
        <div style={{
          position: "absolute", top: 0, right: 0, bottom: 0,
          width: 90,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 6,
          fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "var(--bone)",
        }}>
          <Trash size={18} weight="bold" />
          Eliminar
        </div>
      </div>
      {/* Draggable front. Swipe left to reveal the red delete layer. */}
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -90, right: 0 }}
        dragElastic={0.2}
        animate={swiped ? { x: -90 } : { x: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onDragStart={onDragStart}
        onDragEnd={(_e, info) => {
          onSwipe(info.offset.x < -60 ? row.uid : null);
        }}
        style={{ position: "relative", background: "#111E16", borderRadius: "var(--r-md)", cursor: "grab", touchAction: "pan-y" }}
      >
        <div style={{
          borderRadius: "var(--r-md)",
          overflow: "hidden",
          background: row.completed ? `rgba(${accent},0.12)` : "rgba(245,240,232,0.04)",
          border: `1px solid ${row.completed ? `rgba(${accent},0.40)` : "rgba(245,240,232,0.09)"}`,
          transition: "background 0.3s ease, border-color 0.3s ease",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 14,
            minHeight: 68, padding: "10px 14px",
          }}>
            {/* Check circle — same language as ExerciseRow on the light list */}
            <motion.button
              onClick={() => onToggleCompleted(i)}
              whileTap={{ scale: 0.88 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              aria-label={isWarmup
                ? (row.completed ? "Calentamiento completado" : "Marcar calentamiento")
                : (row.completed ? `Serie ${workingNum} completada` : `Marcar serie ${workingNum}`)}
              style={{
                width: 42, height: 42, borderRadius: 999, flexShrink: 0,
                background: row.completed ? (isWarmup ? "var(--clay)" : "var(--moss)") : "transparent",
                border: row.completed ? "none" : "1.5px dashed rgba(245,240,232,0.30)",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.2s ease, border-color 0.2s ease",
              }}
            >
              {row.completed && (
                <svg width="17" height="13" viewBox="0 0 16 12" fill="none">
                  <path d="M1 6L5.5 10.5L15 1.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </motion.button>

            {/* Set label + previous-session ghost chip (tap copies value+RPE) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 0, alignItems: "flex-start", paddingRight: 6 }}>
              {isWarmup ? (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em",
                  color: row.completed ? "rgba(245,240,232,0.92)" : "rgba(245,240,232,0.60)",
                  textTransform: "uppercase", transition: "color 0.25s",
                }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 18, height: 18, borderRadius: 5, fontSize: 11, fontWeight: 700,
                    letterSpacing: 0,
                    color: "var(--clay)",
                    background: "rgba(217,119,87,0.16)",
                    border: "1px solid rgba(217,119,87,0.40)",
                  }}>W</span>
                  Calent.
                </span>
              ) : (
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em",
                  color: row.completed ? "rgba(245,240,232,0.92)" : "rgba(245,240,232,0.60)",
                  textTransform: "uppercase", transition: "color 0.25s",
                }}>
                  S{workingNum}
                </span>
              )}
              {prevForRow && (
                <motion.button
                  type="button"
                  onClick={() => onCopyPrev(i, prevForRow)}
                  whileTap={{ scale: 0.9 }}
                  title="Copiar de la última vez"
                  aria-label={`Última vez: ${prevForRow.value}${isTimeBased ? " segundos" : " reps"}${
                    equipmentType === "weight" && prevForRow.load != null ? `, ${prevForRow.load} kg` : ""
                  }${equipmentType === "band" && prevBand ? `, banda ${prevBand.label}` : ""}. Copiar.`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1,
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "none",
                    background: "rgba(245,240,232,0.06)",
                    color: "rgba(245,240,232,0.60)",
                    cursor: "pointer",
                  }}
                >
                  <ClockCounterClockwise size={13} weight="bold" style={{ opacity: 0.55 }} />
                  <span style={{ fontWeight: 600 }}>{prevForRow.value}{isTimeBased ? "s" : "×"}</span>
                  {equipmentType === "weight" && prevForRow.load != null && (
                    <span style={{ opacity: 0.6, fontSize: 10 }}>· {prevForRow.load}kg</span>
                  )}
                  {equipmentType === "band" && prevBand && (
                    <span style={{
                      width: 9, height: 9, borderRadius: 999, marginLeft: 2,
                      background: prevBand.hex, border: "1px solid rgba(245,240,232,0.3)",
                    }} />
                  )}
                </motion.button>
              )}
            </div>

            {/* Metrics — fixed-width columns so numbers line up across every set */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {/* Time-based sets get a play/stop button that runs the precise countdown
                  (beep + wake lock); on finish the set auto-completes. */}
              {isTimeBased && !row.completed && (
                <motion.button
                  onClick={() => (timing ? onStopTimer?.() : onStartTimer?.(i))}
                  whileTap={{ scale: 0.9 }}
                  aria-label={timing ? "Detener temporizador" : "Iniciar temporizador"}
                  style={{
                    width: 38, height: 38, borderRadius: 999, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                    background: timing ? "var(--clay)" : "rgba(138,168,140,0.18)",
                    border: timing ? "none" : "1px solid rgba(138,168,140,0.45)",
                  }}
                >
                  {timing
                    ? <Ico.stop s={15} c="#fff" />
                    : <Ico.play s={15} c="var(--moss)" />}
                </motion.button>
              )}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 46 }}>
                {isTimeBased && timing ? (
                  <span className="num" style={{ fontSize: 26, lineHeight: 1, color: "var(--clay)" }}>
                    {timerSecondsLeft ?? row.value}s
                  </span>
                ) : (
                  <EditableNum
                    value={row.value}
                    min={1}
                    max={isTimeBased ? 300 : 200}
                    completed={row.completed}
                    onChange={v => onUpdate(i, "value", v)}
                    suffix={isTimeBased ? "s" : "×"}
                    size={26}
                  />
                )}
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em",
                  color: "rgba(245,240,232,0.40)",
                }}>
                  {isTimeBased ? "TIEMPO" : "REPS"}
                </span>
              </div>
              {equipmentType === "weight" && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 46 }}>
                  <EditableNum
                    value={row.load}
                    min={0}
                    max={500}
                    completed={row.completed}
                    onChange={v => onUpdate(i, "load", v)}
                    suffix="kg"
                    size={26}
                  />
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em",
                    color: "rgba(245,240,232,0.40)",
                  }}>
                    PESO
                  </span>
                </div>
              )}
              {equipmentType === "band" && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 46 }}>
                  <button
                    onClick={() => onOpenBand(i)}
                    aria-label={rowBand ? `Banda ${rowBand.label}. Cambiar.` : "Elegir banda"}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 34, height: 34, borderRadius: 999, cursor: "pointer",
                      background: rowBand ? rowBand.hex : "rgba(245,240,232,0.06)",
                      border: rowBand ? "1px solid rgba(245,240,232,0.35)" : "1.5px dashed rgba(245,240,232,0.35)",
                    }}
                  >
                    {!rowBand && <Palette size={17} weight="bold" color="rgba(245,240,232,0.60)" />}
                  </button>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em",
                    color: "rgba(245,240,232,0.40)",
                  }}>
                    BANDA
                  </span>
                </div>
              )}
            </div>

            {/* Expand caret — opens panel (pain + copy-to-following) */}
            <button
              onClick={() => onToggleExpand(i)}
              aria-label="Más opciones"
              style={{
                background: "none", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 30, height: 30, borderRadius: 8, position: "relative", flexShrink: 0,
              }}
            >
              {!row.expanded && row.painDuring > 0 && (
                <span style={{
                  position: "absolute", top: 3, right: 3,
                  width: 6, height: 6, borderRadius: 999,
                  background: row.painDuring <= 4 ? "#C9C96E" : "#C96E6E",
                }} />
              )}
              <span style={{
                display: "flex", alignItems: "center",
                transform: row.expanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.18s ease",
              }}>
                <Ico.chevR s={15} c="rgba(245,240,232,0.55)" />
              </span>
            </button>
          </div>

          {/* Pain panel */}
          <AnimatePresence>
            {row.expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                style={{ overflow: "hidden" }}
              >
                <div style={{
                  padding: "14px 16px 18px",
                  borderTop: "1px solid rgba(245,240,232,0.08)",
                  background: "rgba(17,30,22,0.35)",
                }}>
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    marginBottom: 12,
                  }}>
                    <span style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      letterSpacing: "0.12em",
                      color: "rgba(245,240,232,0.60)",
                    }}>
                      DOLOR
                    </span>
                    <span style={{
                      fontSize: 12,
                      fontFamily: "var(--font-mono)",
                      color: row.painDuring === 0
                        ? "#6EC96E"
                        : row.painDuring <= 4
                        ? "#C9C96E"
                        : "#C96E6E",
                      transition: "color 0.2s",
                    }}>
                      {PAIN_LABELS[Math.round(row.painDuring)]}
                    </span>
                  </div>
                  <input
                    type="range"
                    className="zone-slider"
                    min={0} max={10} step={1}
                    value={row.painDuring}
                    onChange={e => onUpdate(i, "painDuring", Number(e.target.value))}
                    style={{
                      "--zone-color": row.painDuring === 0 ? "#6EC96E" : row.painDuring <= 4 ? "#C9C96E" : "#C96E6E",
                    } as React.CSSProperties}
                  />
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    fontSize: 9,
                    color: "rgba(245,240,232,0.45)",
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.08em",
                    marginTop: 4,
                  }}>
                    <span>0</span><span>5</span><span>10</span>
                  </div>

                  {/* Copy all values (incl. pain) to every following set */}
                  {!isLast && (
                    <motion.button
                      type="button"
                      onClick={() => onCopyFollowing(i)}
                      whileTap={{ scale: 0.97 }}
                      aria-label={`Copiar valores de la serie ${i + 1} a las siguientes`}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        width: "100%", marginTop: 18,
                        padding: "11px 14px",
                        borderRadius: 10,
                        border: "1px solid rgba(245,240,232,0.12)",
                        background: "rgba(245,240,232,0.05)",
                        color: "rgba(245,240,232,0.78)",
                        fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        cursor: "pointer",
                      }}
                    >
                      <ArrowLineDown size={16} weight="bold" />
                      Copiar a las series siguientes
                    </motion.button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
