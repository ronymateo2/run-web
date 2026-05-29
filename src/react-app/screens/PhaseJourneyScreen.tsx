import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useDb } from "../hooks/useDb";
import { useSync } from "../hooks/useSync";
import { Ico } from "../components/icons";
import { getCriteria, getPhasesForInjury, getActiveInjuries, getPhaseById, type Phase, type Injury, type PhaseCriteria } from "../../db/queries/injuries";
import { getExercisesForPhase, getTodayLogs, getSessionPhasesByDate, getPhaseProgress, type Exercise, type DaySession } from "../../db/queries/exercises";
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
  month: MonthGrid;
  sessionsByDate: Map<string, DaySession[]>;
}

interface MonthCell {
  date: string | null; // null = leading/trailing blank
  dayNum: number;
  isToday: boolean;
}
interface MonthGrid {
  label: string; // "mayo 2026"
  cells: MonthCell[]; // padded to start on Monday
}

const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

function getMonthGrid(tz?: string | null): MonthGrid {
  const today = localToday(tz);
  const ref = new Date(today + "T12:00:00");
  const year = ref.getFullYear();
  const month = ref.getMonth();

  const first = new Date(year, month, 1, 12);
  const dow = first.getDay(); // 0=Sun
  const lead = dow === 0 ? 6 : dow - 1; // blanks before day 1 (Mon-start)
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: MonthCell[] = [];
  for (let i = 0; i < lead; i++) cells.push({ date: null, dayNum: 0, isToday: false });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d, 12).toLocaleDateString("en-CA");
    cells.push({ date, dayNum: d, isToday: date === today });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, dayNum: 0, isToday: false });

  const label = ref.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return { label, cells };
}

export function PhaseJourneyScreen() {
  const { id } = useParams<{ id: string }>();
  const { user, lastSyncAt } = useAuth();
  const db = useDb();
  const push = useSync();
  const navigate = useNavigate();
  const [data, setData] = useState<PhaseJourneyData | null>(null);
  const [selectedInjuryId, setSelectedInjuryId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!db || !id) return;
    const phase = await getPhaseById(db, id);
    if (!phase) return;
    const criteria = await getCriteria(db, id);
    const injuries = user ? await getActiveInjuries(db, user.id) : [];
    const injury = injuries.find(i => i.id === phase.injury_id);
    const progressPct = user ? await getPhaseProgress(db, phase, injury?.focus_days, user.id) : 0;
    const allPhases = await getPhasesForInjury(db, phase.injury_id);
    const nextPhase = allPhases.find(p => p.phase_num === phase.phase_num + 1);
    const exercises = await getExercisesForPhase(db, id);
    const today = localToday(user?.timezone);
    const logs = user ? await getTodayLogs(db, user.id, today) : [];
    const doneIds = new Set(logs.map(l => l.exercise_id));
    const sessionsByDate = user ? await getSessionPhasesByDate(db, user.id) : new Map<string, DaySession[]>();
    const month = getMonthGrid(user?.timezone);
    setData({ phase, criteria, progressPct, injury, allInjuries: injuries, nextPhase, exercises, doneIds, month, sessionsByDate });
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

  const { phase, criteria, progressPct, injury, allInjuries, nextPhase, exercises, doneIds, month, sessionsByDate } = data;
  const selInjuryId = selectedInjuryId ?? phase.injury_id;
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

        {/* Month calendar — F-badge (fase) over each trained day, one injury at a time */}
        {(() => {
          const INJURY_COLORS = ["var(--clay)", "var(--moss)", "var(--sun)", "#7B8FA1"];
          const selIdx = allInjuries.findIndex(inj => inj.id === selInjuryId);
          const selColor = INJURY_COLORS[(selIdx < 0 ? 0 : selIdx) % INJURY_COLORS.length];
          // highest phase trained on a day for the selected injury (null = none)
          const phaseFor = (date: string | null): number | null => {
            if (!date) return null;
            const nums = (sessionsByDate.get(date) ?? [])
              .filter(s => s.injury_id === selInjuryId)
              .map(s => s.phase_num);
            return nums.length ? Math.max(...nums) : null;
          };
          return (
            <div className="card mt-20" style={{ padding: "18px 20px 20px" }}>
              <div className="row between" style={{ marginBottom: 14, alignItems: "baseline" }}>
                <div className="eyebrow">Calendario</div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: "0.02em", textTransform: "capitalize" }}>
                  {month.label}
                </span>
              </div>

              {/* Injury selector */}
              {allInjuries.length > 1 && (
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  {allInjuries.map((inj, i) => {
                    const active = inj.id === selInjuryId;
                    const c = INJURY_COLORS[i % INJURY_COLORS.length];
                    return (
                      <button
                        key={inj.id}
                        onClick={() => setSelectedInjuryId(inj.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                          fontFamily: "var(--font-mono)", fontSize: 11,
                          border: active ? "none" : "1px solid var(--line)",
                          background: active ? c : "transparent",
                          color: active ? "#fff" : "var(--muted)",
                        }}
                      >
                        <div style={{
                          width: 7, height: 7, borderRadius: 999, flexShrink: 0,
                          background: active ? "#fff" : c,
                        }} />
                        {inj.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Weekday header */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
                {DAY_LABELS.map((label, i) => (
                  <div key={i} style={{
                    textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10,
                    color: "var(--ink-3)", letterSpacing: "0.03em",
                  }}>
                    {label}
                  </div>
                ))}
              </div>

              {/* Day grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                {month.cells.map((cell, idx) => {
                  if (!cell.date) return <div key={idx} />;
                  const ph = phaseFor(cell.date);
                  return (
                    <div key={cell.date} style={{
                      position: "relative", aspectRatio: "1",
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 2,
                      borderRadius: 8,
                      background: cell.isToday ? "var(--ink)" : "transparent",
                      border: cell.isToday ? "none" : "1px solid var(--line)",
                    }}>
                      {/* F-badge over the day (F1 style) */}
                      <div style={{ minHeight: 12 }}>
                        {ph !== null && (
                          <span style={{
                            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                            lineHeight: 1, padding: "2px 4px", borderRadius: 4,
                            color: "#fff", background: cell.isToday ? "rgba(255,255,255,0.25)" : selColor,
                          }}>
                            F{ph}
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 12,
                        fontWeight: cell.isToday ? 700 : 400,
                        color: cell.isToday ? "#fff" : ph !== null ? "var(--ink)" : "var(--ink-3)",
                      }}>
                        {cell.dayNum}
                      </span>
                    </div>
                  );
                })}
              </div>
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
