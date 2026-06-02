import { useState, useEffect } from "react";
import { Ico } from "./icons";
import { BottomSheet } from "./BottomSheet";
import { exerciseRepository, type Exercise, type ExerciseLog } from "../../data/repositories";

interface Props {
  date: string;
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
  userId,
  exercises,
  phaseColor,
  phaseName,
  onClose,
}: Props) {
  const [grouped, setGrouped] = useState<GroupedExercise[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const logs = await exerciseRepository.getTodayLogs(userId, date);
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
  }, [userId, date, exercises]);

  return (
    <BottomSheet onClose={onClose}>
      {(close) => (
        <>
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
                  onClick={close}
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
                                  {log.reps_done} {(ex.duration_s != null && ex.reps == null) ? "s" : "reps"}
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
        </>
      )}
    </BottomSheet>
  );
}
