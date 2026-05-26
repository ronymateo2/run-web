import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useDb } from "../hooks/useDb";
import { TabBar } from "../components/TabBar";
import { Plant, Leaf, Flower, Tree } from "@phosphor-icons/react";
import { Ico } from "../components/icons";
import { getActiveInjuries, getPhasesForInjury, getCurrentPhase, getCriteria, computePhaseProgress, type Injury, type Phase, type PhaseCriteria } from "../../db/queries/injuries";

const PHASE_ICONS = [
  (s?: number) => <Plant  size={s ?? 18} weight="regular" />,
  (s?: number) => <Leaf   size={s ?? 18} weight="regular" />,
  (s?: number) => <Flower size={s ?? 18} weight="regular" />,
  (s?: number) => <Tree   size={s ?? 18} weight="regular" />,
];

interface PhaseWithProgress extends Phase {
  criteria: PhaseCriteria[];
  progressPct: number;
}

interface InjuryData {
  injury: Injury;
  phases: PhaseWithProgress[];
  current: Phase | null;
}

export function PhasesOverviewScreen() {
  const { user } = useAuth();
  const db = useDb();
  const navigate = useNavigate();
  const [data, setData] = useState<InjuryData[] | null>(null);

  useEffect(() => {
    if (!db || !user) return;
    let active = true;
    (async () => {
      const injuries = await getActiveInjuries(db, user.id);
      const result: InjuryData[] = await Promise.all(
        injuries.map(async (inj) => {
          const phases = await getPhasesForInjury(db, inj.id);
          const current = await getCurrentPhase(db, inj);
          const phasesWithProgress: PhaseWithProgress[] = await Promise.all(
            phases.map(async (p) => {
              const criteria = await getCriteria(db, p.id);
              const progressPct = computePhaseProgress(criteria);
              return { ...p, criteria, progressPct };
            })
          );
          return { injury: inj, phases: phasesWithProgress, current };
        })
      );
      if (active) setData(result);
    })();
    return () => { active = false; };
  }, [db, user]);

  return (
    <div className="screen">
      <div className="screen-body" style={{ paddingBottom: 100 }}>
        <div className="col gap-4 mt-4">
          <div className="eyebrow">Sendero</div>
          <div className="title-lg serif">Tu plan de 20 semanas.</div>
          <div className="body mt-2">
            El coach no te deja avanzar sin completar el 70% de cada fase.
          </div>
        </div>

        {!data && (
          <div style={{ paddingTop: 32, textAlign: "center" }}>
            <span className="body-sm">Cargando…</span>
          </div>
        )}

        {data?.map(({ injury, phases, current }) => (
          <div key={injury.id} style={{ marginTop: 28 }}>
            {data.length > 1 && (
              <div className="eyebrow mt-4" style={{ marginBottom: 12 }}>{injury.name}</div>
            )}

            {/* Mini-timeline */}
            <div className="card" style={{ padding: "14px 18px", marginBottom: 16 }}>
              <div className="row gap-0" style={{ alignItems: "center" }}>
                {phases.map((p, i) => {
                  const isCurrent = p.id === current?.id;
                  const isDone = current && p.phase_num < (current.phase_num ?? 0);
                  return (
                    <div key={p.id} className="row gap-0" style={{ flex: 1, alignItems: "center" }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 999, flexShrink: 0,
                        background: isDone ? "var(--ink)" : isCurrent ? "var(--clay)" : "var(--line)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, border: isCurrent ? "2px solid var(--clay-deep)" : "none",
                      }}>
                        {isDone ? <Ico.check s={13} c="#EDE6D6" /> : PHASE_ICONS[i](14)}
                      </div>
                      {i < phases.length - 1 && (
                        <div style={{ flex: 1, height: 2, background: isDone ? "var(--ink)" : "var(--line)" }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Phase cards */}
            <div className="col gap-12">
              {phases.map((p, i) => {
                const isCurrent = p.id === current?.id;
                const isLocked = current ? p.phase_num > (current.phase_num ?? 0) : i > 0;
                const isUnlocking = isCurrent && p.progressPct < p.threshold_pct;

                return (
                  <div
                    key={p.id}
                    className="card"
                    style={{
                      padding: 18, opacity: isLocked ? 0.55 : 1,
                      cursor: isCurrent ? "pointer" : "default",
                    }}
                    onClick={() => isCurrent && navigate(`/path/phase/${p.id}`)}
                  >
                    <div className="row between" style={{ alignItems: "flex-start" }}>
                      <div className="col gap-4" style={{ flex: 1 }}>
                        <div className="row gap-8" style={{ alignItems: "center" }}>
                          <span style={{ display: "flex" }}>{PHASE_ICONS[i](20)}</span>
                          <div>
                            <div className="eyebrow" style={{ fontSize: 12 }}>
                              Fase {p.phase_num} · semanas {p.week_start}–{p.week_end}
                            </div>
                            <div className="title-md serif" style={{ lineHeight: 1.1, marginTop: 2 }}>
                              {p.name}
                            </div>
                          </div>
                        </div>

                        {isCurrent && (
                          <div style={{ marginTop: 10 }}>
                            <div className="row between" style={{ marginBottom: 6 }}>
                              <span className="body-sm" style={{ fontSize: 14 }}>Progreso</span>
                              <span className="body-sm num" style={{ fontSize: 14 }}>{p.progressPct}% / {p.threshold_pct}%</span>
                            </div>
                            <div style={{ position: "relative", height: 6, borderRadius: 999, background: "var(--line)", overflow: "visible" }}>
                              <div style={{ width: `${p.progressPct}%`, height: "100%", background: "var(--ink)", borderRadius: 999 }} />
                              {/* Threshold marker */}
                              <div style={{
                                position: "absolute", top: -4, left: `${p.threshold_pct}%`,
                                width: 2, height: 14, background: "var(--clay)", borderRadius: 1,
                              }} />
                            </div>
                            {isUnlocking && (
                              <div className="body-sm mt-6" style={{ color: "var(--clay-deep)", fontSize: 14 }}>
                                Te faltan {p.threshold_pct - p.progressPct}% para desbloquear fase {p.phase_num + 1}.
                              </div>
                            )}
                          </div>
                        )}

                        {p.description && <div className="body mt-6">{p.description}</div>}
                      </div>

                      <div style={{ marginLeft: 12 }}>
                        {isLocked ? (
                          <Ico.lock s={18} c="var(--muted)" />
                        ) : isCurrent ? (
                          <Ico.chevR s={18} c="var(--muted)" />
                        ) : (
                          <Ico.check s={18} c="var(--moss)" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Progress link */}
        <button
          className="btn-pill ghost mt-24"
          onClick={() => navigate("/path/progress")}
        >
          Ver gráfica de progreso <Ico.chart s={16} c="var(--ink)" />
        </button>
      </div>

      <TabBar />
    </div>
  );
}
