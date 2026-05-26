import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useDb } from "../hooks/useDb";
import { Ico } from "../components/icons";
import { getCriteria, computePhaseProgress, getPhasesForInjury, getActiveInjuries, type Phase, type Injury, type PhaseCriteria } from "../../db/queries/injuries";
import { queryOne, exec } from "../../db/client";

interface PhaseJourneyData {
  phase: Phase & { description?: string };
  criteria: PhaseCriteria[];
  progressPct: number;
  injury: Injury | undefined;
  nextPhase: Phase | undefined;
}

export function PhaseJourneyScreen() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const db = useDb();
  const navigate = useNavigate();
  const [data, setData] = useState<PhaseJourneyData | null>(null);

  const loadData = useCallback(async () => {
    if (!db || !id) return;
    const phase = await queryOne<Phase & { description?: string }>(
      db, `SELECT * FROM phases WHERE id = ?`, [id]
    );
    if (!phase) return;
    const criteria = await getCriteria(db, id);
    const progressPct = computePhaseProgress(criteria);
    const injuries = user ? await getActiveInjuries(db, user.id) : [];
    const injury = injuries.find(i => i.id === phase.injury_id);
    const allPhases = await getPhasesForInjury(db, phase.injury_id);
    const nextPhase = allPhases.find(p => p.phase_num === phase.phase_num + 1);
    setData({ phase, criteria, progressPct, injury, nextPhase });
  }, [db, id, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function toggleCriteria(criteriaId: string, current: boolean) {
    if (!db) return;
    await exec(db, `UPDATE phase_criteria SET done = ? WHERE id = ?`, [current ? 0 : 1, criteriaId]);
    await loadData();
  }

  if (!data) return (
    <div className="screen">
      <div className="screen-body" style={{ paddingTop: 32 }}><span className="body-sm">Cargando…</span></div>
    </div>
  );

  const { phase, criteria, progressPct, injury, nextPhase } = data;
  const locked = progressPct < phase.threshold_pct;

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

        {injury && <div className="eyebrow mt-8" style={{ color: "var(--clay-deep)" }}>{injury.name}</div>}

        <div className="title-lg serif mt-4" style={{ lineHeight: 1.05 }}>
          {phase.name}
        </div>
        <div className="body-sm mt-4">
          Semanas {phase.week_start}–{phase.week_end}
        </div>

        {/* Progress bar with threshold marker */}
        <div className="card mt-20" style={{ padding: 18 }}>
          <div className="row between" style={{ marginBottom: 8 }}>
            <span className="body-sm">Progreso hacia fase {phase.phase_num + 1}</span>
            <span className="num body-sm">{progressPct}% / {phase.threshold_pct}%</span>
          </div>
          <div style={{ position: "relative", height: 10, borderRadius: 999, background: "var(--line)", overflow: "visible" }}>
            <div style={{
              width: `${progressPct}%`, height: "100%",
              background: locked ? "var(--sun)" : "var(--moss)",
              borderRadius: 999, transition: "width 0.4s ease",
            }} />
            <div style={{
              position: "absolute", top: -6, left: `${phase.threshold_pct}%`,
              width: 2, height: 22, background: "var(--clay)", borderRadius: 1,
            }} />
            <div style={{
              position: "absolute", top: -18, left: `${phase.threshold_pct}%`,
              transform: "translateX(-50%)",
              fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--clay-deep)", whiteSpace: "nowrap",
            }}>
              {phase.threshold_pct}% mínimo
            </div>
          </div>
          {locked && (
            <div className="body-sm mt-12" style={{ color: "var(--clay-deep)" }}>
              Faltan {phase.threshold_pct - progressPct}% para desbloquear{" "}
              {nextPhase ? `"${nextPhase.name}"` : "la siguiente fase"}.
            </div>
          )}
        </div>

        {/* Coach message */}
        <div className="card mt-16" style={{ padding: 18, background: "var(--ink)" }}>
          <div className="eyebrow" style={{ color: "rgba(237,230,214,0.5)" }}>el coach dice</div>
          <div className="title-md serif mt-8" style={{ color: "var(--bone)", lineHeight: 1.15 }}>
            "No hay atajo. Cuando los criterios estén en verde, el paso viene solo."
          </div>
        </div>

        {/* Criteria checklist */}
        {criteria.length > 0 && (
          <>
            <div className="title-md serif mt-24">Criterios de avance</div>
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

        {phase.description && (
          <div className="body-sm mt-20" style={{ lineHeight: 1.6 }}>{phase.description}</div>
        )}
      </div>
    </div>
  );
}
