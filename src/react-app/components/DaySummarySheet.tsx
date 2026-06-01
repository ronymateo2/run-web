import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Ico } from "./icons";
import type { DrizzleDb } from "../../db/drizzle";
import type { Exercise, ExerciseLog } from "../../db/queries/exercises";
import { getTodayLogs } from "../../db/queries/exercises";

interface Props {
  date: string;
  db: DrizzleDb;
  userId: string;
  exercises: Exercise[];
  phaseColor: string;
  phaseName: string;
  onClose: () => void;
}

interface GroupedExercise {
  exercise: Exercise;
  logs: ExerciseLog[];
}

function painColor(level: number | null): string {
  if (level === null || level === 0) return "#6EC96E";
  if (level <= 4) return "#C9C96E";
  return "#C96E6E";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T12:00").toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function DaySummarySheet({
  date,
  db,
  userId,
  exercises,
  phaseColor,
  phaseName,
  onClose,
}: Props) {
  const [grouped, setGrouped] = useState<GroupedExercise[] | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const logs = await getTodayLogs(db, userId, date);
      if (cancelled) return;
      const exerciseMap = new Map(exercises.map((e) => [e.id, e]));
      const filtered = logs.filter((l) => exerciseMap.has(l.exercise_id));
      const byId = new Map<string, ExerciseLog[]>();
      for (const log of filtered) {
        const arr = byId.get(log.exercise_id) ?? [];
        arr.push(log);
        byId.set(log.exercise_id, arr);
      }
      const result: GroupedExercise[] = [];
      for (const [exId, logs] of byId) {
        const exercise = exerciseMap.get(exId);
        if (exercise) result.push({ exercise, logs });
      }
      result.sort((a, b) => a.exercise.sort_order! - b.exercise.sort_order!);
      setGrouped(result);
    }
    load();
    return () => { cancelled = true; };
  }, [db, userId, date, exercises]);

  const handleClose = () => setVisible(false);

  return createPortal(
    <AnimatePresence onExitComplete={onClose}>
      {visible && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={handleClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(31,58,46,0.45)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 35 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              maxHeight: "calc(100vh - 60px)",
              background: "var(--bg)",
              borderRadius: "24px 24px 0 0",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 -8px 40px rgba(31,58,46,0.18)",
            }}
          >
            {/* Handle */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                paddingTop: 10,
                paddingBottom: 4,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 999,
                  background: "var(--line-2)",
                }}
              />
            </div>

            {/* Header */}
            <div
              style={{
                padding: "10px 20px 16px",
                flexShrink: 0,
                borderBottom: "1px solid var(--line)",
              }}
            >
              <div className="row between" style={{ alignItems: "center" }}>
                <button
                  onClick={handleClose}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: "6px 8px",
                    cursor: "pointer",
                    color: "var(--ink-3)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontFamily: "var(--font-sans)",
                    fontSize: 14,
                  }}
                >
                  <Ico.chevL s={14} />
                  Cerrar
                </button>
                <div
                  className="chip"
                  style={{
                    background: phaseColor,
                    color: "#fff",
                    border: "none",
                  }}
                >
                  {phaseName}
                </div>
              </div>
              <div
                className="title-md mt-10"
                style={{
                  lineHeight: 1.15,
                  textTransform: "capitalize",
                }}
              >
                {formatDate(date)}
              </div>
            </div>

            {/* Body */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "14px 20px 20px",
                paddingBottom: "calc(20px + env(safe-area-inset-bottom, 20px))",
              }}
            >
              {grouped === null ? (
                <span className="body-sm" style={{ color: "var(--muted)" }}>
                  Cargando…
                </span>
              ) : grouped.length === 0 ? (
                <div
                  className="card-flat"
                  style={{
                    padding: "24px 16px",
                    textAlign: "center",
                  }}
                >
                  <span className="body" style={{ color: "var(--muted)" }}>
                    Sin ejercicios registrados este día.
                  </span>
                </div>
              ) : (
                grouped.map((group) => {
                  const ex = group.exercise;
                  const logs = group.logs;
                  const totalSets = ex.sets ?? 1;
                  const doneSets = logs.length;
                  const avgRpe = logs.reduce((s, l) => s + (l.rpe ?? 0), 0) / logs.length || 0;
                  const maxPain = logs.reduce((m, l) => Math.max(m, l.pain_during ?? 0), 0);
                  return (
                    <div
                      key={ex.id}
                      className="card"
                      style={{ padding: "14px 16px", marginBottom: 10 }}
                    >
                      <div
                        className="row between"
                        style={{ alignItems: "flex-start", marginBottom: 10 }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            className="body"
                            style={{ fontWeight: 600, color: "var(--ink)" }}
                          >
                            {ex.name}
                          </div>
                          <div
                            className="body-sm mt-2"
                            style={{ color: "var(--ink-3)" }}
                          >
                            {doneSets}/{totalSets} sets
                            {logs.length > 0 && (
                              <>
                                {" · "}
                                <span style={{ fontWeight: 500 }}>
                                  RPE {Math.round(avgRpe)}
                                </span>
                              </>
                            )}
                            {maxPain > 0 && (
                              <>
                                {" · "}
                                <span
                                  style={{
                                    fontWeight: 600,
                                    color: painColor(maxPain),
                                  }}
                                >
                                  dolor {maxPain}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {doneSets >= totalSets ? (
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 999,
                              background: "var(--moss)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <Ico.check s={16} c="#fff" />
                          </div>
                        ) : (
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 999,
                              border: "1.5px solid var(--line-2)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 13,
                                fontWeight: 600,
                                color: "var(--ink-3)",
                              }}
                            >
                              {doneSets}
                            </span>
                          </div>
                        )}
                      </div>

                      {logs.length > 0 && (
                        <div
                          style={{
                            borderTop: "1px solid var(--line)",
                            paddingTop: 10,
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          {logs.map((log, i) => (
                            <div
                              key={log.id}
                              className="row"
                              style={{
                                alignItems: "center",
                                gap: 12,
                                fontSize: 13,
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 10,
                                  color: "var(--muted)",
                                  letterSpacing: "0.12em",
                                  textTransform: "uppercase",
                                  minWidth: 30,
                                }}
                              >
                                Set {i + 1}
                              </span>
                              {log.reps_done != null && (
                                <span
                                  style={{
                                    fontFamily: "var(--font-mono)",
                                    color: "var(--ink)",
                                  }}
                                >
                                  {log.reps_done} reps
                                </span>
                              )}
                              {log.rpe != null && (
                                <span
                                  style={{
                                    fontFamily: "var(--font-mono)",
                                    color: "var(--ink-3)",
                                  }}
                                >
                                  RPE {log.rpe}
                                </span>
                              )}
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 11,
                                  color: painColor(log.pain_during),
                                  marginLeft: "auto",
                                }}
                              >
                                {log.pain_during != null && log.pain_during > 0 && (
                                  <>
                                    <span
                                      style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: 999,
                                        background: painColor(log.pain_during),
                                        flexShrink: 0,
                                      }}
                                    />
                                    dolor {log.pain_during}
                                  </>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
