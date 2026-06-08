import { useState, useEffect } from "react";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { BottomSheet } from "../components/BottomSheet";
import { Ico } from "../components/icons";
import { exerciseRepository, type Exercise, type ExerciseLog } from "../../data/repositories";
import { useAuth } from "../auth/AuthContext";

interface Props {
  exercise: Exercise;
  onClose: () => void;
}

interface SessionData {
  date: string;
  avgReps: number;
  avgRpe: number;
  avgPain: number;
  totalSets: number;
}

function aggregateBySession(logs: ExerciseLog[]): SessionData[] {
  const byDate = new Map<string, ExerciseLog[]>();
  logs.forEach(log => {
    const existing = byDate.get(log.session_date) ?? [];
    existing.push(log);
    byDate.set(log.session_date, existing);
  });

  return Array.from(byDate.entries())
    .map(([date, sessionLogs]) => ({
      date,
      avgReps: sessionLogs.reduce((sum, l) => sum + (l.reps_done ?? 0), 0) / sessionLogs.length,
      avgRpe: sessionLogs.reduce((sum, l) => sum + (l.rpe ?? 0), 0) / sessionLogs.length,
      avgPain: sessionLogs.reduce((sum, l) => sum + (l.pain_during ?? 0), 0) / sessionLogs.length,
      totalSets: sessionLogs.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function formatDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

const TICK_STYLE = { fontSize: 12, fill: "rgba(245,240,232,0.85)", fontWeight: 500 } as const;

export function ExerciseStatsSheet({ exercise, onClose }: Props) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);

  const isTimeBased = !!exercise.duration_s && !exercise.reps;
  const valueLabel = isTimeBased ? "segundos" : "reps";

  useEffect(() => {
    if (!user) return;
    exerciseRepository.getAllLogsForExercise(user.id, exercise.id).then(logs => {
      setSessions(aggregateBySession(logs));
      setLoading(false);
    });
  }, [user, exercise.id]);

  const totalSessions = sessions.length;
  const bestReps = sessions.length > 0 ? Math.max(...sessions.map(s => s.avgReps)) : 0;
  const avgReps = sessions.length > 0
    ? sessions.reduce((sum, s) => sum + s.avgReps, 0) / sessions.length
    : 0;
  const avgRpe = sessions.length > 0
    ? sessions.reduce((sum, s) => sum + s.avgRpe, 0) / sessions.length
    : 0;

  return (
    <BottomSheet variant="dark" onClose={onClose}>
      {(close) => (
        <>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "14px 20px", flexShrink: 0,
          }}>
            <span style={{
              fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.12em",
              color: "rgba(245,240,232,0.55)",
            }}>
              ESTADÍSTICAS
            </span>
            <button
              onClick={close}
              aria-label="Cerrar"
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 4,
                display: "flex", alignItems: "center",
              }}
            >
              <Ico.close s={20} c="rgba(245,240,232,0.70)" />
            </button>
          </div>

          <div style={{
            padding: "0 20px 20px",
            paddingBottom: "calc(20px + env(safe-area-inset-bottom, 20px))",
            overflowY: "auto",
          }}>
            <div style={{
              fontSize: 20, fontFamily: "var(--font-serif)", color: "var(--bone)",
              marginBottom: 20,
            }}>
              {exercise.name}
            </div>

            {loading ? (
              <div style={{
                height: 200, display: "flex", alignItems: "center", justifyContent: "center",
                color: "rgba(245,240,232,0.5)",
              }}>
                Cargando...
              </div>
            ) : sessions.length < 2 ? (
              <div style={{
                height: 200, display: "flex", alignItems: "center", justifyContent: "center",
                color: "rgba(245,240,232,0.5)", textAlign: "center",
              }}>
                Necesitas al menos 2 sesiones para ver tendencias
              </div>
            ) : (
              <>
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 12, marginBottom: 24,
                }}>
                  <div style={{
                    background: "rgba(245,240,232,0.05)", borderRadius: 12, padding: 14,
                  }}>
                    <div style={{
                      fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.10em",
                      color: "rgba(245,240,232,0.55)", marginBottom: 6,
                    }}>
                      SESIONES
                    </div>
                    <div style={{
                      fontSize: 28, fontFamily: "var(--font-serif)", color: "var(--bone)",
                    }}>
                      {totalSessions}
                    </div>
                  </div>
                  <div style={{
                    background: "rgba(245,240,232,0.05)", borderRadius: 12, padding: 14,
                  }}>
                    <div style={{
                      fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.10em",
                      color: "rgba(245,240,232,0.55)", marginBottom: 6,
                    }}>
                      MEJOR
                    </div>
                    <div style={{
                      fontSize: 28, fontFamily: "var(--font-serif)", color: "var(--bone)",
                    }}>
                      {bestReps.toFixed(0)}
                    </div>
                  </div>
                  <div style={{
                    background: "rgba(245,240,232,0.05)", borderRadius: 12, padding: 14,
                  }}>
                    <div style={{
                      fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.10em",
                      color: "rgba(245,240,232,0.55)", marginBottom: 6,
                    }}>
                      PROMEDIO
                    </div>
                    <div style={{
                      fontSize: 28, fontFamily: "var(--font-serif)", color: "var(--bone)",
                    }}>
                      {avgReps.toFixed(0)}
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <div style={{
                    fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.10em",
                    color: "rgba(245,240,232,0.85)", marginBottom: 12,
                  }}>
                    {valueLabel.toUpperCase()} POR SESIÓN
                  </div>
                  <div style={{ width: "100%", height: 140 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sessions} margin={{ top: 6, right: 6, bottom: 20, left: 6 }}>
                        <Bar
                          dataKey="avgReps"
                          fill="#6EC96E"
                          radius={[4, 4, 0, 0]}
                          barSize={16}
                          isAnimationActive={false}
                        />
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatDate}
                          tick={TICK_STYLE}
                          axisLine={false}
                          tickLine={false}
                          interval="preserveStartEnd"
                          dy={8}
                        />
                        <YAxis hide />
                        <Tooltip
                          contentStyle={{
                            background: "#1A2A20",
                            border: "1px solid rgba(245,240,232,0.2)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          labelStyle={{ color: "rgba(245,240,232,0.7)", fontSize: 11 }}
                          itemStyle={{ color: "var(--bone)", fontSize: 12 }}
                          formatter={(value) => [Number(value).toFixed(1), valueLabel]}
                          labelFormatter={(label) => formatDate(String(label))}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <div style={{
                    fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.10em",
                    color: "rgba(245,240,232,0.85)", marginBottom: 12,
                  }}>
                    RPE POR SESIÓN
                  </div>
                  <div style={{ width: "100%", height: 120 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sessions} margin={{ top: 6, right: 6, bottom: 20, left: 6 }}>
                        <Bar
                          dataKey="avgRpe"
                          fill="#C9C96E"
                          radius={[4, 4, 0, 0]}
                          barSize={16}
                          isAnimationActive={false}
                        />
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatDate}
                          tick={TICK_STYLE}
                          axisLine={false}
                          tickLine={false}
                          interval="preserveStartEnd"
                          dy={8}
                        />
                        <YAxis domain={[0, 10]} hide />
                        <Tooltip
                          contentStyle={{
                            background: "#1A2A20",
                            border: "1px solid rgba(245,240,232,0.2)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          labelStyle={{ color: "rgba(245,240,232,0.7)", fontSize: 11 }}
                          itemStyle={{ color: "var(--bone)", fontSize: 12 }}
                          formatter={(value) => [Number(value).toFixed(1), "RPE"]}
                          labelFormatter={(label) => formatDate(String(label))}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div>
                  <div style={{
                    fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.10em",
                    color: "rgba(245,240,232,0.85)", marginBottom: 12,
                  }}>
                    DOLOR POR SESIÓN
                  </div>
                  <div style={{ width: "100%", height: 120 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sessions} margin={{ top: 6, right: 6, bottom: 20, left: 6 }}>
                        <Bar
                          dataKey="avgPain"
                          fill="#C96E6E"
                          radius={[4, 4, 0, 0]}
                          barSize={16}
                          isAnimationActive={false}
                        />
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatDate}
                          tick={TICK_STYLE}
                          axisLine={false}
                          tickLine={false}
                          interval="preserveStartEnd"
                          dy={8}
                        />
                        <YAxis domain={[0, 10]} hide />
                        <Tooltip
                          contentStyle={{
                            background: "#1A2A20",
                            border: "1px solid rgba(245,240,232,0.2)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          labelStyle={{ color: "rgba(245,240,232,0.7)", fontSize: 11 }}
                          itemStyle={{ color: "var(--bone)", fontSize: 12 }}
                          formatter={(value) => [Number(value).toFixed(1), "Dolor"]}
                          labelFormatter={(label) => formatDate(String(label))}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div style={{
                  marginTop: 20, padding: 12,
                  background: "rgba(245,240,232,0.03)", borderRadius: 8,
                  fontSize: 11, color: "rgba(245,240,232,0.5)",
                  fontFamily: "var(--font-mono)",
                }}>
                  RPE promedio: {avgRpe.toFixed(1)} · {totalSessions} sesiones totales
                </div>
              </>
            )}
          </div>
        </>
      )}
    </BottomSheet>
  );
}
