import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Plant, Leaf, Flower, Tree } from "@phosphor-icons/react";
import { Ico } from "../components/icons";
import { injuryRepository, exerciseRepository, effectiveFocusDays, type Injury, type Phase } from "../../data/repositories";

const PHASE_ICONS = [
  (s?: number, c?: string) => <Plant  size={s ?? 18} weight="regular" color={c} />,
  (s?: number, c?: string) => <Leaf   size={s ?? 18} weight="regular" color={c} />,
  (s?: number, c?: string) => <Flower size={s ?? 18} weight="regular" color={c} />,
  (s?: number, c?: string) => <Tree   size={s ?? 18} weight="regular" color={c} />,
];

interface PhaseWithProgress extends Phase {
  progressPct: number;
}

interface InjuryData {
  injury: Injury;
  phases: PhaseWithProgress[];
  current: Phase | null;
  activityWeeks: Set<number>;
}

export function PhasesOverviewScreen() {
  const { user, lastSyncAt } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<InjuryData[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phasesExpanded, setPhasesExpanded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const injuries = await injuryRepository.getActiveInjuries(user.id);
      const sessionDates = await exerciseRepository.getSessionDates(user.id);
      const result: InjuryData[] = await Promise.all(
        injuries.map(async (inj) => {
          const phases = await injuryRepository.getPhasesForInjury(inj.id);
          const current = await injuryRepository.getCurrentPhase(inj);
          const phasesWithProgress: PhaseWithProgress[] = await Promise.all(
            phases.map(async (p) => {
              const progressPct = await exerciseRepository.getPhaseProgress(p, effectiveFocusDays(p, inj), user.id);
              return { ...p, progressPct };
            })
          );
          const startedAt = inj.started_at ?? Date.now();
          const MS_PER_WEEK = 7 * 24 * 3600 * 1000;
          const activityWeeks = new Set(
            sessionDates.map(d => Math.max(1, Math.floor((new Date(d + "T00:00:00").getTime() - startedAt) / MS_PER_WEEK) + 1))
          );
          return { injury: inj, phases: phasesWithProgress, current, activityWeeks };
        })
      );
      if (active) {
        setData(result);
        setSelectedId(prev => prev ?? result[0]?.injury.id ?? null);
      }
    })();
    return () => { active = false; };
  }, [user, lastSyncAt]);

  const selectInjury = (id: string) => {
    setSelectedId(id);
    setPhasesExpanded(false);
  };

  const sel = data?.find(d => d.injury.id === (selectedId ?? data[0]?.injury.id)) ?? null;

  // Renders a single phase card. `hero` = large current-phase card (with progress bar);
  // otherwise a compact card (locked/done) for the collapsed list.
  const renderPhaseCard = (p: PhaseWithProgress, i: number, current: Phase | null, hero: boolean) => {
    const isCurrent = p.id === current?.id;
    const isPast = current ? p.phase_num < (current.phase_num ?? 0) : false;
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

            {hero && isCurrent && (
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
            ) : isPast ? (
              <Ico.check s={18} c="var(--moss)" />
            ) : (
              <Ico.chevR s={18} c="var(--muted)" />
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="screen">
      <div className="screen-body" style={{ paddingBottom: 100 }}>
        {/* Header */}
        <div className="row between mt-4" style={{ alignItems: "flex-start" }}>
          <div className="col gap-4">
            <div className="eyebrow">Sendero</div>
            <div className="title-lg serif">Tu plan de 20 semanas.</div>
          </div>
          <button
            className="btn-pill ghost"
            style={{ width: 44, height: 44, padding: 0, flexShrink: 0 }}
            aria-label="Ver gráfica de progreso"
            onClick={() => navigate("/path/progress")}
          >
            <Ico.chart s={18} c="var(--ink)" />
          </button>
        </div>
        <div className="body mt-2">
          El coach no te deja avanzar sin completar el 70% de cada fase.
        </div>

        {!data && (
          <div style={{ paddingTop: 32, textAlign: "center" }}>
            <span className="body-sm">Cargando…</span>
          </div>
        )}

        {/* Injury selector */}
        {data && data.length > 1 && (
          <div
            className="row gap-8 mt-20"
            style={{ overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}
          >
            {data.map(({ injury }) => {
              const active = injury.id === sel?.injury.id;
              return (
                <button
                  key={injury.id}
                  className="chip"
                  style={{
                    flexShrink: 0, cursor: "pointer", whiteSpace: "nowrap",
                    background: active ? "var(--clay)" : "var(--card-soft)",
                    color: active ? "#fff" : "var(--ink)",
                    border: active ? "1px solid var(--clay)" : "1px solid var(--line)",
                  }}
                  onClick={() => selectInjury(injury.id)}
                >
                  {injury.name}
                </button>
              );
            })}
          </div>
        )}

        {sel && (() => {
          const { phases, current } = sel;
          const hero = phases.find(p => p.id === current?.id) ?? phases[0];
          const heroIdx = phases.findIndex(p => p.id === hero?.id);
          const others = phases.map((p, i) => ({ p, i })).filter(({ p }) => p.id !== hero?.id);

          return (
            <div style={{ marginTop: 20 }}>
              {/* Phase timeline */}
              <div className="card" style={{ padding: "16px 20px", marginBottom: 16, overflow: "hidden" }}>
                <div style={{ position: "relative" }}>
                  <div style={{
                    position: "absolute", top: "50%", transform: "translateY(-50%)",
                    left: 24, right: 24, height: 1, background: "var(--line)",
                  }} />
                  <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
                    {phases.map((p, i) => {
                      const isCurrent = p.id === current?.id;
                      const isPast = current ? p.phase_num < (current.phase_num ?? 0) : false;
                      const bg = isCurrent ? "var(--clay)" : "var(--line)";
                      const iconColor = isCurrent ? "var(--bg)" : isPast ? "var(--ink)" : "var(--muted)";
                      const sz = isCurrent ? 48 : 38;
                      return (
                        <div
                          key={p.id}
                          style={{
                            width: sz, height: sz, borderRadius: "50%",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: bg, flexShrink: 0,
                            cursor: isCurrent ? "pointer" : "default",
                          }}
                          onClick={() => isCurrent && navigate(`/path/phase/${p.id}`)}
                        >
                          {PHASE_ICONS[i](isCurrent ? 22 : 18, iconColor)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Hero — current phase */}
              {hero && renderPhaseCard(hero, heroIdx, current, true)}

              {/* Collapsible rest */}
              {others.length > 0 && (
                <>
                  <button
                    className="btn-pill ghost mt-12"
                    onClick={() => setPhasesExpanded(v => !v)}
                  >
                    {phasesExpanded ? "Ocultar fases" : `Ver las ${phases.length} fases`}
                    <span style={{ display: "flex", transform: phasesExpanded ? "rotate(-90deg)" : "rotate(90deg)" }}>
                      <Ico.chevR s={16} c="var(--ink)" />
                    </span>
                  </button>

                  {phasesExpanded && (
                    <div className="col gap-12 mt-12">
                      {others.map(({ p, i }) => renderPhaseCard(p, i, current, false))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
