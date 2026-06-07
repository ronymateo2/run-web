import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { useAuth } from "../auth/AuthContext";
import { BackButton } from "../components/BackButton";
import { ScreenNav } from "../components/ScreenNav";
import {
  promRepository,
  exerciseRepository,
  severityBand,
  promTrend,
  worstItems,
  type PromInstrument,
  type PromResult,
  type WorstItem,
} from "../../data/repositories";

interface DetailData {
  inst: PromInstrument;
  results: PromResult[];
  sessionDates: string[];
}

// Count exercise days in (from, to] — adherence between two questionnaire completions.
function sessionsBetween(dates: string[], from: string, to: string): number {
  return dates.filter((d) => d > from && d <= to).length;
}

function insightLine(improving: boolean | null, sessions: number): string {
  if (improving == null) return `${sessions} días con ejercicio desde el inicio.`;
  if (improving && sessions >= 6) return `Mejoraste con ${sessions} sesiones. La constancia rinde.`;
  if (improving) return `Mejoraste con apenas ${sessions} sesiones — buen signo.`;
  if (sessions >= 6) return `Aún sin reflejarse pese a ${sessions} sesiones. Dale tiempo.`;
  return `El score y la constancia bajaron (${sessions} sesiones) — quizá relacionado.`;
}

export function PromDetailScreen() {
  const { instrumentId } = useParams<{ instrumentId: string }>();
  const { user, lastSyncAt } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DetailData | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const insts = await promRepository.getInstruments();
      const inst = insts.find((i) => i.id === instrumentId);
      if (!inst) { if (active) setMissing(true); return; }
      const results = await promRepository.getRecentPromByInstrument(user.id, inst.id, 12);
      const sessionDates = await exerciseRepository.getSessionDates(user.id);
      if (active) setData({ inst, results, sessionDates });
    })();
    return () => { active = false; };
  }, [user, instrumentId, lastSyncAt]);

  if (missing) {
    return (
      <div className="screen">
        <ScreenNav back={<BackButton fallbackPath="/path/progress" color="var(--ink)" />}>
          <div className="eyebrow">Cuestionario</div><div style={{ width: 34 }} />
        </ScreenNav>
        <div className="screen-body" style={{ paddingTop: 32 }}>
          <div className="body-sm">Cuestionario no encontrado.</div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="screen">
        <div className="screen-body" style={{ paddingTop: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span className="body-sm">Cargando…</span>
        </div>
      </div>
    );
  }

  const { inst, results, sessionDates } = data;
  const latest = results[0] ?? null;
  const prev = results[1] ?? null;
  const series = [...results].reverse().map((p) => ({ date: p.date, score: p.score ?? 0 }));

  if (!latest) {
    return (
      <div className="screen">
        <ScreenNav back={<BackButton fallbackPath="/path/progress" color="var(--ink)" />}>
          <span className="eyebrow">{inst.name}</span><div style={{ width: 34 }} />
        </ScreenNav>
        <div className="screen-body" style={{ paddingBottom: 100 }}>
          <div className="title-lg serif mt-12">Sin registros aún.</div>
          <div className="body-sm mt-4">Responde el cuestionario para ver tu progreso.</div>
          <button className="btn-pill mt-20" style={{ width: "100%" }}
            onClick={() => navigate(`/today/prom/${inst.id}`)}>
            Responder ahora
          </button>
        </div>
      </div>
    );
  }

  const score = latest.score ?? 0;
  const band = severityBand(inst, score);
  const trend = promTrend(inst, score, prev?.score ?? null);
  const answers = latest.answers ? (JSON.parse(latest.answers) as Record<string, number>) : {};
  const worst: WorstItem[] = worstItems(inst, answers, 4);
  const sessions = prev ? sessionsBetween(sessionDates, prev.date, latest.date) : sessionsBetween(sessionDates, "", latest.date);

  return (
    <div className="screen">
      <ScreenNav back={<BackButton fallbackPath="/path/progress" color="var(--ink)" />}>
        <span className="eyebrow">{inst.name}</span><div style={{ width: 34 }} />
      </ScreenNav>
      <div className="screen-body" style={{ paddingBottom: 100 }}>

        {/* Score + interpretation */}
        <div className="row between mt-12" style={{ alignItems: "flex-end" }}>
          <div className="num serif" style={{ fontSize: 64, color: "var(--ink)", lineHeight: 0.9 }}>
            {score.toFixed(0)}<span className="body-sm" style={{ color: "var(--ink-3)" }}> /100</span>
          </div>
          <span style={{
            padding: "5px 12px", borderRadius: 999, background: band.tone,
            color: "#fff", fontSize: 13, fontWeight: 700,
          }}>{band.label}</span>
        </div>
        <div className="body-sm mt-8" style={{ color: "var(--ink-3)" }}>
          {inst.better_is_higher ? "Más alto = mejor" : "Más bajo = mejor"}.
          {trend.delta != null && (
            <>{" "}<span style={{ color: trend.improving ? "var(--moss)" : "var(--clay)", fontWeight: 600 }}>
              {trend.delta > 0 ? "+" : ""}{trend.delta} vs anterior{trend.mcid ? " · cambio relevante" : ""}
            </span>.</>
          )}
        </div>

        {/* Trend */}
        {series.length > 1 && (
          <div className="card mt-16" style={{ padding: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>tendencia · últimas {series.length}</div>
            <div style={{ width: "100%", height: 90 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <Line type="monotone" dataKey="score"
                    stroke={inst.better_is_higher ? "var(--moss)" : "var(--clay)"}
                    strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                  <XAxis dataKey="date" hide />
                  <YAxis domain={[0, 100]} hide />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Drill-down: what limits you most */}
        {worst.length > 0 && (
          <>
            <div className="title-md serif mt-24">Lo que más te limita</div>
            <div className="eyebrow mt-4">de tu último registro</div>
            <div className="card mt-12" style={{ padding: 18 }}>
              <div className="col gap-14">
                {worst.map((it, i) => (
                  <div key={i} className="col gap-6">
                    <div className="row between" style={{ alignItems: "baseline" }}>
                      <span className="body" style={{ fontWeight: 600, flex: 1, paddingRight: 10 }}>{it.text}</span>
                      <span className="num" style={{ fontSize: 14, color: "var(--clay-deep)" }}>{it.value}/{it.max}</span>
                    </div>
                    <div className="bar" style={{ background: "rgba(31,58,46,0.08)" }}>
                      <div className="bar-fill" style={{ width: `${(it.value / it.max) * 100}%`, background: "var(--clay)" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Cross with adherence */}
        <div className="title-md serif mt-24">Contexto</div>
        <div className="card mt-12" style={{ padding: 18 }}>
          <div className="row gap-12" style={{ alignItems: "center" }}>
            <div className="num serif" style={{ fontSize: 32, color: "var(--ink)" }}>{sessions}</div>
            <div className="body-sm" style={{ flex: 1, lineHeight: 1.5 }}>{insightLine(trend.improving, sessions)}</div>
          </div>
        </div>

        {/* History */}
        {results.length > 1 && (
          <>
            <div className="title-md serif mt-24">Historial</div>
            <div className="card mt-12" style={{ padding: "6px 16px" }}>
              {results.map((r, i) => {
                const t = promTrend(inst, r.score ?? 0, results[i + 1]?.score ?? null);
                return (
                  <div key={r.id} className="row between" style={{
                    padding: "12px 0", borderTop: i > 0 ? "1px solid var(--line)" : "none", alignItems: "center",
                  }}>
                    <span className="body-sm" style={{ color: "var(--ink-3)" }}>{r.date}</span>
                    <span className="row gap-8" style={{ alignItems: "baseline" }}>
                      {t.delta != null && (
                        <span className="num" style={{ fontSize: 12, color: t.improving ? "var(--moss)" : "var(--clay)" }}>
                          {t.delta > 0 ? "+" : ""}{t.delta}
                        </span>
                      )}
                      <span className="num serif" style={{ fontSize: 20, color: "var(--ink)" }}>{(r.score ?? 0).toFixed(0)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <button className="btn-pill mt-24" style={{ width: "100%" }}
          onClick={() => navigate(`/today/prom/${inst.id}`)}>
          Volver a responder
        </button>
      </div>
    </div>
  );
}
