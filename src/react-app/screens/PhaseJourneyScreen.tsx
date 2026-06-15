import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { usePhaseJourney } from "../features/usePhaseJourney";
import { Ico } from "../components/icons";
import { BackButton } from "../components/BackButton";
import { ScreenNav } from "../components/ScreenNav";
import { MonthCalendar } from "../components/MonthCalendar";
import { DaySummarySheet } from "../components/DaySummarySheet";

const PHASE_COLORS = ["var(--clay)", "var(--moss)", "var(--sun)", "#7B8FA1", "#B59A6A"];

function ProgressRing({ pct, threshold, locked }: { pct: number; threshold: number; locked: boolean }) {
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDrawn(Math.min(pct, 100)), 80);
    return () => clearTimeout(t);
  }, [pct]);
  const R = 40;
  const C = 2 * Math.PI * R;
  const a = ((Math.min(threshold, 100) / 100) * 360 - 90) * (Math.PI / 180);
  return (
    <svg width={108} height={108} viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
      <circle cx={50} cy={50} r={R} fill="none" stroke="var(--line)" strokeWidth={5.5} />
      <circle
        cx={50} cy={50} r={R} fill="none"
        stroke={locked ? "var(--sun)" : "var(--moss)"}
        strokeWidth={5.5} strokeLinecap="round"
        strokeDasharray={`${(drawn / 100) * C} ${C}`}
        transform="rotate(-90 50 50)"
        style={{ transition: "stroke-dasharray 0.9s var(--ease-bounce)" }}
      />
      <line
        x1={50 + Math.cos(a) * 33.5} y1={50 + Math.sin(a) * 33.5}
        x2={50 + Math.cos(a) * 46.5} y2={50 + Math.sin(a) * 46.5}
        stroke="var(--clay)" strokeWidth={2} strokeLinecap="round"
      />
      <text x={50} y={51} textAnchor="middle" fontFamily="var(--font-serif)" fontSize={27} fill="var(--ink)">
        {pct}<tspan fontSize={13} fill="var(--muted)">%</tspan>
      </text>
      <text x={50} y={66} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={7.5} fill="var(--muted)" letterSpacing="0.12em">
        UMBRAL {threshold}%
      </text>
    </svg>
  );
}

export function PhaseJourneyScreen() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, toggleCriteria } = usePhaseJourney(id);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  if (!data) return (
    <div className="screen">
      <div className="screen-body" style={{ paddingTop: 32 }}><span className="body-sm">Cargando…</span></div>
    </div>
  );

  const { phase, criteria, progressPct, injury, nextPhase, exercises, doneIds, sessionsByDate } = data;
  const phaseColor = PHASE_COLORS[(phase.phase_num - 1) % PHASE_COLORS.length];
  const locked = progressPct < phase.threshold_pct;
  const doneCnt = exercises.filter(e => doneIds.has(e.id)).length;
  const doneCriteria = criteria.filter(c => c.done).length;

  return (
    <div className="screen">
      <ScreenNav back={<BackButton fallbackPath="/path" color="var(--ink)" />}>
        <div className="eyebrow">Fase {phase.phase_num}</div>
        <div style={{ width: 34 }} />
      </ScreenNav>
      <div className="screen-body" style={{ paddingBottom: exercises.length > 0 ? 230 : 170 }}>

        {/* Hero: title + progress dial */}
        <div className="row between rise rise-1" style={{ alignItems: "center", gap: 12, marginTop: 18 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {injury && (
              <div className="eyebrow" style={{ color: phaseColor }}>
                {injury.name}
              </div>
            )}
            <div className="title-lg mt-6" style={{ lineHeight: 1.05 }}>
              {phase.name}
            </div>
            <div className="chip mt-12" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.04em" }}>
              <span className="dot" style={{ background: phaseColor }} />
              Semanas {phase.week_start}–{phase.week_end}
            </div>
          </div>
          <ProgressRing pct={progressPct} threshold={phase.threshold_pct} locked={locked} />
        </div>

        {/* Criteria trail → gate to next phase */}
        <div className="card rise rise-2" style={{ marginTop: 22, padding: "18px 18px 16px" }}>
          <div className="row between" style={{ alignItems: "baseline", marginBottom: 8 }}>
            <span className="eyebrow">
              camino a {nextPhase?.name ?? "la siguiente fase"}
            </span>
            {criteria.length > 0 && (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 12,
                color: doneCriteria === criteria.length ? "var(--moss)" : "var(--muted)",
              }}>
                {doneCriteria}/{criteria.length}
              </span>
            )}
          </div>

          <div style={{ position: "relative" }}>
            {/* rail connecting nodes */}
            <div style={{
              position: "absolute", left: 13, top: 16, bottom: 26,
              width: 2, background: "var(--line)", borderRadius: 1,
            }} />

            {criteria.map(c => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => toggleCriteria(c.id, c.done)}
                onKeyDown={(e) => e.key === "Enter" && toggleCriteria(c.id, c.done)}
                className="row"
                style={{ gap: 14, padding: "9px 0", cursor: "pointer", position: "relative", alignItems: "flex-start" }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 999, flexShrink: 0,
                  background: c.done ? "var(--moss)" : "var(--card)",
                  border: c.done ? "none" : "1.5px solid var(--line-2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 0.2s ease, border-color 0.2s ease",
                }}>
                  {c.done && <Ico.check s={14} c="#fff" />}
                </div>
                <span className="body" style={{
                  paddingTop: 4,
                  color: c.done ? "var(--muted)" : "var(--ink)",
                  textDecoration: c.done ? "line-through" : "none",
                  textDecorationColor: "var(--faint)",
                }}>
                  {c.description}
                </span>
              </div>
            ))}

            {/* Gate node — next phase */}
            <div className="row" style={{ gap: 14, paddingTop: criteria.length > 0 ? 12 : 4, position: "relative", alignItems: "flex-start" }}>
              <div style={{
                width: 28, height: 28, borderRadius: 9, flexShrink: 0,
                background: locked ? "var(--ink)" : "var(--moss)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {locked ? <Ico.lock s={13} c="#fff" /> : <Ico.check s={14} c="#fff" />}
              </div>
              <div style={{ paddingTop: 1 }}>
                <div className="body" style={{ fontWeight: 700 }}>
                  {nextPhase?.name ?? "Siguiente fase"}
                </div>
                <div className="body-sm" style={{ marginTop: 1 }}>
                  {locked ? (
                    <>
                      Se abre al {phase.threshold_pct}% — te faltan{" "}
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--clay-deep)" }}>
                        {phase.threshold_pct - progressPct}%
                      </span>
                      . Con los criterios en verde, paso solo.
                    </>
                  ) : (
                    <>Umbral alcanzado — con los criterios en verde, paso solo.</>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <MonthCalendar
          sessionsByDate={sessionsByDate}
          phaseColors={PHASE_COLORS}
          timezone={user?.timezone}
          injuryId={phase.injury_id}
          onDateClick={(date) => setSelectedDate(date)}
        />
      </div>

      {exercises.length > 0 && createPortal(
        <button
          className="btn-pill"
          style={{
            position: "fixed",
            left: 16, right: 16,
            width: "auto",
            bottom: "calc(88px + var(--sab, 0px))",
            justifyContent: "center",
            background: "var(--ink)", color: "var(--bone)",
            zIndex: 50,
            boxShadow: "0 4px 20px rgba(31,58,46,0.25)",
          }}
          onClick={() => navigate(`/path/phase/${phase.id}/exercises`)}
        >
          Ver ejercicios de hoy · {doneCnt}/{exercises.length}
        </button>,
        document.body
      )}

      {selectedDate && user?.id && (
        <DaySummarySheet
          date={selectedDate}
          userId={user.id}
          injuryId={phase.injury_id}
          phaseColors={PHASE_COLORS}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
