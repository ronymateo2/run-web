import { useState, useEffect } from "react";
import { BottomSheet } from "@shared/components/BottomSheet";
import { Ico } from "@shared/components/icons";
import { exerciseRepository, type Exercise, type ExerciseLog } from "@data/repositories";
import { useAuth } from "@features/auth/AuthContext";

const SHOWN_SESSIONS = 8;

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

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.12em",
  color: "rgba(245,240,232,0.60)",
};

/** Brand-toned bar chart: value on top of each bar, date underneath, no axes. */
function MiniBars({
  data, color, max, fmt, height = 96,
}: {
  data: { date: string; value: number }[];
  color: string;
  max?: number;
  fmt?: (v: number) => string;
  height?: number;
}) {
  const m = Math.max(max ?? Math.max(...data.map(d => d.value)), 1);
  const f = fmt ?? ((v: number) => String(Math.round(v)));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
      {data.map((d, i) => {
        const barH = Math.max(4, Math.round((d.value / m) * height));
        return (
          <div key={d.date} style={{
            flex: 1, minWidth: 0,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
          }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
              color: "rgba(245,240,232,0.85)",
            }}>
              {f(d.value)}
            </span>
            <div
              style={{
                width: "100%", maxWidth: 26, height: barH,
                borderRadius: "6px 6px 3px 3px",
                background: color,
                transformOrigin: "bottom",
                animation: `barGrow 0.5s var(--ease-bounce) ${i * 0.04}s both`,
              }}
            />
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.02em",
              color: "rgba(245,240,232,0.45)", whiteSpace: "nowrap",
            }}>
              {formatDate(d.date)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div style={{
      background: "rgba(245,240,232,0.05)",
      border: "1px solid rgba(245,240,232,0.08)",
      borderRadius: "var(--r-sm)",
      padding: "12px 14px",
    }}>
      <div style={{ ...SECTION_LABEL, marginBottom: 6 }}>{label}</div>
      <div style={{
        fontSize: 28, fontFamily: "var(--font-serif)", color: "var(--bone)",
        lineHeight: 1, display: "flex", alignItems: "baseline", gap: 2,
      }}>
        {value}
        {unit && <span style={{ fontSize: 14, color: "rgba(245,240,232,0.55)" }}>{unit}</span>}
      </div>
    </div>
  );
}

export function ExerciseStatsSheet({ exercise, onClose }: Props) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);

  const isTimeBased = !!exercise.duration_s && !exercise.reps;
  const valueLabel = isTimeBased ? "segundos" : "reps";
  const unit = isTimeBased ? "s" : "×";

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

  const shown = sessions.slice(-SHOWN_SESSIONS);
  const truncated = sessions.length > SHOWN_SESSIONS;
  const noPain = shown.every(s => s.avgPain === 0);

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
              fontSize: 24, fontFamily: "var(--font-serif)", color: "var(--bone)",
              lineHeight: 1.1, marginBottom: 18,
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
                height: 180,
                display: "flex", flexDirection: "column", gap: 8,
                alignItems: "center", justifyContent: "center", textAlign: "center",
                borderRadius: "var(--r-md)",
                border: "1px dashed rgba(245,240,232,0.18)",
              }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 19, color: "var(--bone)" }}>
                  Aún no hay tendencias
                </span>
                <span style={{ fontSize: 13, color: "rgba(245,240,232,0.55)", maxWidth: 260 }}>
                  Registra al menos 2 sesiones para ver tu progreso aquí.
                </span>
              </div>
            ) : (
              <>
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 10, marginBottom: 26,
                }}>
                  <StatCard label="SESIONES" value={String(totalSessions)} />
                  <StatCard label="MEJOR" value={bestReps.toFixed(0)} unit={unit} />
                  <StatCard label="PROMEDIO" value={avgReps.toFixed(0)} unit={unit} />
                </div>

                <div style={{ marginBottom: 28 }}>
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "baseline",
                    marginBottom: 14,
                  }}>
                    <span style={SECTION_LABEL}>{valueLabel.toUpperCase()} POR SESIÓN</span>
                    {truncated && (
                      <span style={{ ...SECTION_LABEL, fontSize: 9, color: "rgba(245,240,232,0.40)" }}>
                        ÚLTIMAS {SHOWN_SESSIONS}
                      </span>
                    )}
                  </div>
                  <MiniBars
                    data={shown.map(s => ({ date: s.date, value: s.avgReps }))}
                    color="var(--moss)"
                  />
                </div>

                <div style={{ marginBottom: 28 }}>
                  <div style={{ ...SECTION_LABEL, marginBottom: 14 }}>
                    ESFUERZO (RPE) POR SESIÓN
                  </div>
                  <MiniBars
                    data={shown.map(s => ({ date: s.date, value: s.avgRpe }))}
                    color="var(--sun)"
                    max={10}
                    height={72}
                    fmt={v => v.toFixed(v % 1 ? 1 : 0)}
                  />
                </div>

                <div>
                  <div style={{ ...SECTION_LABEL, marginBottom: 14 }}>
                    DOLOR POR SESIÓN
                  </div>
                  {noPain ? (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "14px 16px",
                      borderRadius: "var(--r-sm)",
                      background: "rgba(138,168,140,0.10)",
                      border: "1px solid rgba(138,168,140,0.30)",
                    }}>
                      <span style={{
                        width: 26, height: 26, borderRadius: 999, flexShrink: 0,
                        background: "var(--moss)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Ico.check s={13} c="#fff" />
                      </span>
                      <span style={{ fontSize: 13, color: "rgba(245,240,232,0.80)" }}>
                        Sin dolor en estas sesiones. Buena señal.
                      </span>
                    </div>
                  ) : (
                    <MiniBars
                      data={shown.map(s => ({ date: s.date, value: s.avgPain }))}
                      color="var(--clay)"
                      max={10}
                      height={72}
                      fmt={v => v.toFixed(v % 1 ? 1 : 0)}
                    />
                  )}
                </div>

                <div style={{
                  marginTop: 24, padding: "10px 14px",
                  background: "rgba(245,240,232,0.04)",
                  border: "1px solid rgba(245,240,232,0.07)",
                  borderRadius: "var(--r-sm)",
                  fontSize: 11, color: "rgba(245,240,232,0.55)",
                  fontFamily: "var(--font-mono)", letterSpacing: "0.02em",
                }}>
                  RPE promedio {avgRpe.toFixed(1)} · {totalSessions} {totalSessions === 1 ? "sesión" : "sesiones"} en total
                </div>
              </>
            )}
          </div>
        </>
      )}
    </BottomSheet>
  );
}
