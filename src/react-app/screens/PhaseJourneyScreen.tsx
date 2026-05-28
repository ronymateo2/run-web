import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useDb } from "../hooks/useDb";
import { useSync } from "../hooks/useSync";
import { Ico } from "../components/icons";
import { getCriteria, computePhaseProgress, getPhasesForInjury, getActiveInjuries, getPhaseById, type Phase, type Injury, type PhaseCriteria } from "../../db/queries/injuries";
import { getExercisesForPhase, getTodayLogs, getSessionDatesByInjury, type Exercise } from "../../db/queries/exercises";
import { exec } from "../../db/client";
import { localToday } from "../utils/timezone";

interface PhaseJourneyData {
  phase: Phase;
  criteria: PhaseCriteria[];
  progressPct: number;
  injury: Injury | undefined;
  allInjuries: Injury[];
  nextPhase: Phase | undefined;
  exercises: Exercise[];
  doneIds: Set<string>;
  weekDays: { label: string; date: string; isToday: boolean }[];
  activeDatesByInjury: Map<string, Set<string>>;
}

const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

function getWeekDays(tz?: string | null): { label: string; date: string; isToday: boolean }[] {
  const today = localToday(tz);
  const ref = new Date(today + "T12:00:00");
  const dow = ref.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() + mondayOffset);
  return DAY_LABELS.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const date = d.toLocaleDateString("en-CA");
    return { label, date, isToday: date === today };
  });
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
    const progressPct = computePhaseProgress(criteria);
    const injuries = user ? await getActiveInjuries(db, user.id) : [];
    const injury = injuries.find(i => i.id === phase.injury_id);
    const allPhases = await getPhasesForInjury(db, phase.injury_id);
    const nextPhase = allPhases.find(p => p.phase_num === phase.phase_num + 1);
    const exercises = await getExercisesForPhase(db, id);
    const today = localToday(user?.timezone);
    const logs = user ? await getTodayLogs(db, user.id, today) : [];
    const doneIds = new Set(logs.map(l => l.exercise_id));
    const activeDatesByInjury = user ? await getSessionDatesByInjury(db, user.id) : new Map<string, Set<string>>();
    const weekDays = getWeekDays(user?.timezone);
    setData({ phase, criteria, progressPct, injury, allInjuries: injuries, nextPhase, exercises, doneIds, weekDays, activeDatesByInjury });
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

  const { phase, criteria, progressPct, injury, allInjuries, nextPhase, exercises, doneIds, weekDays, activeDatesByInjury } = data;
  const locked = progressPct < phase.threshold_pct;
  const doneCnt = exercises.filter(e => doneIds.has(e.id)).length;

  return (
    <div className="screen">
      <div className="screen-body" style={{ paddingBottom: 100 }}>

        {/* Header */}
        <div className="row between mt-4" style={{ alignItems: "center" }}>
          <button onClick={() => navigate("/path")} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <Ico.chevL s={22} c="var(--ink)" />
          </button>
          <div className="eyebrow">Fase {phase.phase_num}</div>
          <div style={{ width: 30 }} />
        </div>

        {/* Injury name */}
        {injury && (
          <div className="eyebrow mt-16" style={{ color: "var(--clay-deep)" }}>
            {injury.name}
          </div>
        )}
        <div className="title-lg mt-6" style={{ lineHeight: 1.1 }}>
          {phase.name}
        </div>
        <div className="body-sm mt-4">
          Semanas {phase.week_start}–{phase.week_end}
        </div>

        {/* Progress card */}
        <div className="card mt-20" style={{ padding: "18px 20px 20px" }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Progreso</div>
          <div className="row between" style={{ alignItems: "flex-end", marginBottom: 14 }}>
            <div style={{
              fontFamily: "var(--font-serif)",
              fontSize: 44,
              lineHeight: 1,
              color: locked ? "var(--clay)" : "var(--moss)",
            }}>
              {progressPct}%
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="eyebrow" style={{ color: "var(--muted)" }}>meta</div>
              <div className="num" style={{ fontSize: 28, lineHeight: 1, marginTop: 4, color: "var(--ink)" }}>
                {phase.threshold_pct}%
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ position: "relative", height: 10, borderRadius: 999, background: "var(--line)" }}>
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

          {locked && (
            <div className="body-sm mt-10" style={{ color: "var(--clay-deep)", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
              Faltan{" "}
              <span className="num" style={{ fontFamily: "var(--font-mono)" }}>{phase.threshold_pct - progressPct}%</span>
              {" "}para desbloquear{" "}
              {nextPhase ? `"${nextPhase.name}"` : "la siguiente fase"}.
            </div>
          )}
        </div>

        {/* Criteria checklist */}
        {criteria.length > 0 && (
          <>
            <div className="title-md serif mt-24">
              criterios para abrir{nextPhase ? ` ${nextPhase.name}` : " la siguiente fase"}
            </div>
            <div className="col gap-10 mt-12">
              {criteria.map(c => (
                <button
                  key={c.id}
                  onClick={() => toggleCriteria(c.id, c.done)}
                  className="card"
                  style={{
                    padding: 14, display: "flex", alignItems: "center", gap: 14,
                    cursor: "pointer", border: "none", textAlign: "left", width: "100%",
                  }}
                >
                  <div style={{
                    width: 26, height: 26, borderRadius: 999, flexShrink: 0,
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
                </button>
              ))}
            </div>
          </>
        )}

        {/* Weekly day calendar */}
        {(() => {
          const INJURY_COLORS = ["var(--clay)", "var(--moss)", "var(--sun)", "#7B8FA1"];
          const DOW_ES = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
          const todayIdx = weekDays.findIndex(d => d.isToday);
          const todayLabel = todayIdx >= 0 ? DOW_ES[todayIdx] : "";
          const todayDayNum = todayIdx >= 0 ? todayIdx + 1 : "";
          return (
            <div className="card mt-20" style={{ padding: "18px 20px 20px" }}>
              <div className="row between" style={{ marginBottom: 16, alignItems: "baseline" }}>
                <div className="eyebrow">Esta semana</div>
                {todayLabel && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: "0.02em" }}>
                    {todayLabel} · día {todayDayNum} de 7
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {weekDays.map(({ label, date, isToday }) => (
                  <div
                    key={date}
                    style={{
                      flex: 1, display: "flex", flexDirection: "column",
                      alignItems: "center", gap: 7, padding: "12px 0",
                      borderRadius: 10,
                      background: isToday ? "var(--ink)" : "transparent",
                      border: isToday ? "none" : "1px solid var(--line)",
                    }}
                  >
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 12,
                      fontWeight: isToday ? 700 : 400,
                      color: isToday ? "#fff" : "var(--ink-3)",
                      letterSpacing: "0.03em",
                    }}>
                      {label}
                    </span>
                    {allInjuries.map((inj, i) => {
                      const active = activeDatesByInjury.get(inj.id)?.has(date) ?? false;
                      const color = INJURY_COLORS[i % INJURY_COLORS.length];
                      return (
                        <div key={inj.id} style={{
                          width: 6, height: 6, borderRadius: 999,
                          background: active
                            ? isToday ? "rgba(255,255,255,0.8)" : color
                            : isToday ? "rgba(255,255,255,0.15)" : "var(--line)",
                        }} />
                      );
                    })}
                  </div>
                ))}
              </div>
              {allInjuries.length > 0 && (
                <div style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
                  {allInjuries.map((inj, i) => (
                    <div key={inj.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: 999, flexShrink: 0,
                        background: INJURY_COLORS[i % INJURY_COLORS.length],
                      }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
                        {inj.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
        {exercises.length > 0 && (
          <button
            className="btn-pill mt-24"
            style={{ width: "100%", justifyContent: "center", background: "var(--ink)", color: "var(--bone)" }}
            onClick={() => navigate(`/path/phase/${phase.id}/exercises`)}
          >
            Ver ejercicios de hoy · {doneCnt}/{exercises.length}
          </button>
        )}
      </div>
    </div>
  );
}
