import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useDb } from "../hooks/useDb";
import { useSync } from "../hooks/useSync";
import { Ico } from "../components/icons";
import { BackButton } from "../components/BackButton";
import { ScreenNav } from "../components/ScreenNav";
import { MonthCalendar } from "../components/MonthCalendar";
import { getCriteria, getPhasesForInjury, getInjuryById, getPhaseById, effectiveFocusDays, type Phase, type Injury, type PhaseCriteria } from "../../db/queries/injuries";
import { getExercisesForPhase, getTodayLogs, getSessionPhasesByDate, getPhaseProgress, type Exercise, type DaySession } from "../../db/queries/exercises";
import { exec } from "../../db/client";

interface PhaseJourneyData {
  phase: Phase;
  criteria: PhaseCriteria[];
  progressPct: number;
  injury: Injury | undefined;
  nextPhase: Phase | undefined;
  exercises: Exercise[];
  doneIds: Set<string>;
  sessionsByDate: Map<string, DaySession[]>;
}

export function PhaseJourneyScreen() {
  const { id } = useParams<{ id: string }>();
  const { user, lastSyncAt } = useAuth();
  const db = useDb();
  const push = useSync();
  const navigate = useNavigate();
  const [data, setData] = useState<PhaseJourneyData | null>(null);

  const loadData = useCallback(async () => {
    if (!db || !id) return;
    const phase = await getPhaseById(db, id);
    if (!phase) return;
    const criteria = await getCriteria(db, id);
    const injury = phase.injury_id ? (await getInjuryById(db, phase.injury_id)) ?? undefined : undefined;
    const progressPct = user ? await getPhaseProgress(db, phase, effectiveFocusDays(phase, injury), user.id) : 0;
    const allPhases = await getPhasesForInjury(db, phase.injury_id);
    const nextPhase = allPhases.find(p => p.phase_num === phase.phase_num + 1);
    const exercises = await getExercisesForPhase(db, id);
    const today = new Date().toLocaleDateString("en-CA");
    const logs = user ? await getTodayLogs(db, user.id, today) : [];
    const doneIds = new Set(logs.map(l => l.exercise_id));
    const sessionsByDate = user ? await getSessionPhasesByDate(db, user.id) : new Map<string, DaySession[]>();
    setData({ phase, criteria, progressPct, injury, nextPhase, exercises, doneIds, sessionsByDate });
  }, [db, id, user]);

  useEffect(() => {
    loadData();
  }, [loadData, lastSyncAt]);

  async function toggleCriteria(criteriaId: string, current: boolean) {
    if (!db) return;
    await exec(`UPDATE phase_criteria SET done = ?, synced = 0 WHERE id = ?`, [current ? 0 : 1, criteriaId]);
    await loadData();
    push();
  }

  if (!data) return (
    <div className="screen">
      <div className="screen-body" style={{ paddingTop: 32 }}><span className="body-sm">Cargando…</span></div>
    </div>
  );

  const { phase, criteria, progressPct, injury, nextPhase, exercises, doneIds, sessionsByDate } = data;
  const PHASE_COLORS = ["var(--clay)", "var(--moss)", "var(--sun)", "#7B8FA1", "var(--bone)"];
  const phaseColor = PHASE_COLORS[(phase.phase_num - 1) % PHASE_COLORS.length];
  const locked = progressPct < phase.threshold_pct;
  const doneCnt = exercises.filter(e => doneIds.has(e.id)).length;

  return (
    <div className="screen">
      <ScreenNav back={<BackButton fallbackPath="/path" color="var(--ink)" />}>
        <div className="eyebrow">Fase {phase.phase_num}</div>
        <div style={{ width: 34 }} />
      </ScreenNav>
      <div className="screen-body" style={{ paddingBottom: exercises.length > 0 ? 230 : 170 }}>

        {/* Injury name */}
        {injury && (
          <div className="eyebrow mt-16" style={{ color: phaseColor }}>
            {injury.name}
          </div>
        )}
        <div className="title-lg mt-6" style={{ lineHeight: 1.1 }}>
          {phase.name}
        </div>
        <div className="body-sm mt-4">
          Semanas {phase.week_start}–{phase.week_end}
        </div>

        {/* Progress + criteria — combined card */}
        <div className="card mt-20" style={{ padding: 0, overflow: "hidden" }}>

          {/* Bar */}
          <div style={{ padding: "14px 16px 10px" }}>
            <div className="row between" style={{ alignItems: "center", marginBottom: 8 }}>
              <span className="eyebrow">progreso de fase</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink)" }}>
                {progressPct}% / {phase.threshold_pct}%
              </span>
            </div>
            <div style={{ position: "relative", height: 8, borderRadius: 999, background: "var(--line)" }}>
              <div style={{
                width: `${progressPct}%`, height: "100%",
                background: locked ? "var(--sun)" : "var(--moss)",
                borderRadius: 999, transition: "width 0.4s ease",
              }} />
              <div style={{
                position: "absolute", top: 0, left: `${phase.threshold_pct}%`,
                width: 2, height: "100%", background: "var(--clay)", borderRadius: 1,
              }} />
            </div>
            <div style={{ position: "relative", height: 16 }}>
              <span style={{
                position: "absolute", left: `${phase.threshold_pct}%`,
                transform: "translateX(-50%)", top: 3,
                fontFamily: "var(--font-mono)", fontSize: 9,
                color: "var(--clay)", letterSpacing: "0.07em",
              }}>UMBRAL</span>
            </div>
          </div>

          {/* Locked notification */}
          {locked && (
            <div style={{
              margin: "0 12px 12px",
              padding: "10px 12px",
              borderRadius: 10,
              background: "var(--ink)",
              display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: 999,
                background: "rgba(255,255,255,0.12)", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Ico.lock s={12} c="#fff" />
              </div>
              <div className="body-sm" style={{ color: "rgba(255,255,255,0.85)" }}>
                <strong style={{ color: "#fff" }}>{nextPhase?.name ?? "La siguiente fase"}</strong>
                {" "}se abre al {phase.threshold_pct}%. Te faltan{" "}
                <span style={{ color: "var(--sun)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                  {phase.threshold_pct - progressPct}%
                </span>
                {" "}— cuando los criterios estén en verde, paso solo.
              </div>
            </div>
          )}

          {/* Criteria */}
          {criteria.length > 0 && (
            <>
              <div style={{ padding: "10px 16px 6px" }}>
                <span className="eyebrow">
                  criterios para abrir{nextPhase ? ` ${nextPhase.name}` : " la siguiente fase"}
                </span>
              </div>
              {criteria.map(c => (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleCriteria(c.id, c.done)}
                  onKeyDown={(e) => e.key === "Enter" && toggleCriteria(c.id, c.done)}
                  style={{
                    padding: "10px 16px", display: "flex", alignItems: "center", gap: 12,
                    cursor: "pointer",
                  }}
                >
                  <div style={{
                    width: 24, height: 24, borderRadius: 999, flexShrink: 0,
                    background: c.done ? "var(--moss)" : "transparent",
                    border: c.done ? "none" : "1.5px solid var(--line-2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {c.done && <Ico.check s={14} c="#fff" />}
                  </div>
                  <span className="body" style={{
                    color: c.done ? "var(--muted)" : "var(--ink)",
                    textDecoration: c.done ? "line-through" : "none",
                  }}>
                    {c.description}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        <MonthCalendar
          sessionsByDate={sessionsByDate}
          phaseColors={PHASE_COLORS}
          timezone={user?.timezone}
          injuryId={phase.injury_id}
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
    </div>
  );
}
