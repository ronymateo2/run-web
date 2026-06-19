import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "@features/auth/AuthContext";
import { Plant, Leaf, Flower, Tree, CaretUpDown, CaretDown } from "@phosphor-icons/react";
import { Ico } from "@shared/components/icons";
import { injuryRepository, exerciseRepository, effectiveFocusDays, type Injury, type Phase } from "@data/repositories";

const PHASE_ICONS = [
  (s?: number, c?: string) => <Plant  size={s ?? 18} weight="regular" color={c} />,
  (s?: number, c?: string) => <Leaf   size={s ?? 18} weight="regular" color={c} />,
  (s?: number, c?: string) => <Flower size={s ?? 18} weight="regular" color={c} />,
  (s?: number, c?: string) => <Tree   size={s ?? 18} weight="regular" color={c} />,
];

const MS_PER_WEEK = 7 * 24 * 3600 * 1000;

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

  const sel = data?.find(d => d.injury.id === (selectedId ?? data[0]?.injury.id)) ?? null;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const selIndex = data && sel ? data.findIndex(d => d.injury.id === sel.injury.id) : -1;

  // Refs to each phase row (keyed by phase id) so the rail nodes + auto-scroll
  // can bring a phase into view; separate ref to the current card for the
  // one-shot highlight.
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const currentCardRef = useRef<HTMLDivElement | null>(null);
  const scrolledFor = useRef<string | null>(null);

  // Smooth-scroll the screen so a phase row is centered. Hand-rolled with rAF
  // because programmatic `behavior:"smooth"` is unreliable on this scroll
  // container across engines — this animates everywhere.
  const scrollToPhase = (id: string) => {
    const el = rowRefs.current[id];
    const sc = el?.closest(".screen") as HTMLElement | null;
    if (!el || !sc) return;
    const elTop = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
    const target = Math.max(0, Math.min(
      elTop - (sc.clientHeight - el.offsetHeight) / 2,
      sc.scrollHeight - sc.clientHeight,
    ));
    const start = sc.scrollTop;
    const dist = target - start;
    if (Math.abs(dist) < 2) return;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 500);
      sc.scrollTop = start + dist * (1 - Math.pow(1 - p, 3)); // ease-out cubic
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  // On entry (and when the active injury / current phase changes) land the user
  // on the current phase and flash a ring so the eye catches it. Fires once per
  // current-phase id — unrelated re-renders won't re-trigger it.
  // Switching injury starts fresh: re-collapse the completed phases.
  useEffect(() => { setShowCompleted(false); }, [selectedId]);

  const currentId = sel?.current?.id ?? null;
  useEffect(() => {
    if (!currentId || scrolledFor.current === currentId) return;
    scrolledFor.current = currentId;
    // Refs are read inside the timeout: the current row/card mount in the same
    // render that resolved currentId, so they're populated by the time it fires.
    const t = setTimeout(() => {
      scrollToPhase(currentId);
      currentCardRef.current?.animate(
        [
          { boxShadow: "0 0 0 0 rgba(217,119,87,0)" },
          { boxShadow: "0 0 0 5px rgba(217,119,87,0.35)" },
          { boxShadow: "0 0 0 0 rgba(217,119,87,0)" },
        ],
        { duration: 1500, easing: "ease-out" }
      );
    }, 480); // let the stagger reveal settle first
    return () => clearTimeout(t);
  }, [currentId, sel?.injury.id]);

  // Row of week dots for a phase: one dot per week in its range,
  // filled (moss) when there was at least one session that week.
  const renderWeekDots = (p: Phase, activityWeeks: Set<number>, muted: boolean) => {
    const weeks: number[] = [];
    for (let w = p.week_start; w <= p.week_end; w++) weeks.push(w);
    return (
      <div className="row gap-6 mt-8" style={{ alignItems: "center" }}>
        {weeks.map(w => (
          <span
            key={w}
            style={{
              width: 7, height: 7, borderRadius: 999,
              background: activityWeeks.has(w) ? "var(--moss)" : "transparent",
              border: activityWeeks.has(w) ? "1px solid var(--moss)" : "1px solid var(--line-2)",
              opacity: muted ? 0.6 : 1,
            }}
          />
        ))}
        <span className="eyebrow" style={{ fontSize: 10, marginLeft: 4 }}>
          sem {p.week_start}–{p.week_end}
        </span>
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

        {/* Injury selector — current injury + count, opens bottom sheet */}
        {data && data.length > 1 && sel && (
          <button
            className="card-flat card-tap"
            style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%",
              padding: "12px 16px", marginTop: 20, cursor: "pointer",
              textAlign: "left", fontFamily: "inherit",
              WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
            }}
            onClick={() => setSheetOpen(true)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="eyebrow" style={{ fontSize: 10 }}>
                Lesión {selIndex + 1} de {data.length}
              </div>
              <div className="body" style={{
                fontWeight: 600, marginTop: 2,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {sel.injury.name}
              </div>
            </div>
            <CaretUpDown size={18} color="var(--muted)" />
          </button>
        )}

        {sel && (() => {
          const { injury, phases, current, activityWeeks } = sel;
          const currentNum = current?.phase_num ?? phases[0]?.phase_num ?? 1;
          const totalPhases = Math.max(currentNum, ...phases.map(p => p.phase_num ?? 0));
          const totalWeeks = phases.length ? Math.max(...phases.map(p => p.week_end)) : 20;
          const startedAt = injury.started_at ?? Date.now();
          const weekNow = Math.min(
            totalWeeks,
            Math.max(1, Math.floor((Date.now() - startedAt) / MS_PER_WEEK) + 1)
          );

          // Resolve each phase's state once — shared by the rail and the list.
          const states = phases.map((p, i) => ({
            p, i,
            isCurrent: p.id === current?.id,
            isPast: current ? (p.phase_num ?? 0) < (current.phase_num ?? 0) : false,
            isLocked: current ? (p.phase_num ?? 0) > (current.phase_num ?? 0) : i > 0,
          }));
          const pastCount = states.filter(s => s.isPast).length;

          const goToPhase = (s: typeof states[number]) => {
            if (s.isPast && !showCompleted) {
              setShowCompleted(true);
              setTimeout(() => scrollToPhase(s.p.id), 60);
            } else {
              scrollToPhase(s.p.id);
            }
          };

          return (
            <div key={injury.id} style={{ marginTop: 20 }}>
              {/* Sticky mini-rail — the whole sendero at a glance, always in view */}
              <div
                style={{
                  position: "sticky", top: 0, zIndex: 20, background: "var(--bg)",
                  margin: "0 -22px", padding: "8px 22px 10px",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <div className="row between" style={{ marginBottom: 8 }}>
                  <span className="eyebrow" style={{ fontSize: 10 }}>Mapa del sendero</span>
                  <span className="eyebrow" style={{ fontSize: 10, color: "var(--clay-deep)" }}>
                    Fase {currentNum} de {totalPhases}
                  </span>
                </div>
                {/* Segmented track — one bar per phase: completed = moss, current
                    = clay outline with its real % filled, locked = faint. */}
                <div className="row" style={{ gap: 4 }}>
                  {states.map((s) => {
                    const fill = Math.min(100, Math.max(0, s.p.progressPct));
                    return (
                      <button
                        key={s.p.id}
                        onClick={() => goToPhase(s)}
                        aria-label={`Fase ${s.p.phase_num}${s.isCurrent ? " (actual)" : s.isPast ? " (completada)" : " (bloqueada)"}`}
                        style={{
                          position: "relative", flex: 1, minWidth: 0,
                          height: s.isCurrent ? 12 : 10, padding: 0, border: "none",
                          cursor: "pointer", borderRadius: 999, overflow: "hidden",
                          background: s.isPast ? "var(--moss)" : s.isCurrent ? "var(--clay-soft)" : "var(--line)",
                          boxShadow: s.isCurrent ? "inset 0 0 0 1.5px var(--clay)" : "none",
                          WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
                        }}
                      >
                        {s.isCurrent && fill > 0 && (
                          <span style={{
                            position: "absolute", left: 0, top: 0, bottom: 0,
                            width: `${fill}%`, background: "var(--clay)",
                          }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Orientation line — static info, intentionally not chip-shaped */}
              <div className="eyebrow" style={{ margin: "16px 0 18px" }}>
                Semana {weekNow} · Fase {currentNum} de {totalPhases}
              </div>

              {/* Completed phases — collapsed into one summary row by default */}
              {pastCount > 0 && (
                <div style={{ display: "flex", gap: 14 }}>
                  <div className="col" style={{ width: 48, alignItems: "center", flexShrink: 0 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: "50%", marginTop: 5,
                      display: "flex", alignItems: "center", justifyContent: "center", background: "var(--moss)",
                    }}>
                      <Ico.check s={16} c="#fff" />
                    </div>
                    <div style={{ flex: 1, minHeight: 24, marginTop: 6, marginBottom: 6, width: 2, background: "var(--moss)" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingBottom: 22 }}>
                    <button
                      onClick={() => setShowCompleted(v => !v)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%",
                        background: "none", border: "none", padding: "8px 0 0", cursor: "pointer",
                        textAlign: "left", fontFamily: "inherit",
                        WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="eyebrow" style={{ fontSize: 11, color: "var(--moss)" }}>Completadas</div>
                        <div className="serif" style={{ fontSize: 19, lineHeight: 1.15, marginTop: 2, color: "var(--ink)" }}>
                          {pastCount} {pastCount === 1 ? "fase completada" : "fases completadas"}
                        </div>
                      </div>
                      <CaretDown
                        size={18}
                        color="var(--muted)"
                        style={{ flexShrink: 0, transform: showCompleted ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}
                      />
                    </button>
                  </div>
                </div>
              )}

              {/* Vertical sendero */}
              {states.map(({ p, i, isCurrent, isPast, isLocked }) => {
                if (isPast && !showCompleted) return null;
                const isUnlocking = isCurrent && p.progressPct < p.threshold_pct;
                const isLast = i === phases.length - 1;

                const nodeSize = isCurrent ? 48 : 38;
                const nodeBg = isCurrent ? "var(--clay)" : isPast ? "var(--moss)" : "var(--card-soft)";
                const nodeBorder = isLocked ? "1px solid var(--line-2)" : "none";
                const iconColor = isCurrent || isPast ? "#fff" : "var(--muted)";

                return (
                  <div
                    key={p.id}
                    ref={(el) => { rowRefs.current[p.id] = el; }}
                    className="rise"
                    style={{ display: "flex", gap: 14, scrollMarginTop: 80, animationDelay: `${i * 0.07}s` }}
                  >
                    {/* Rail: node + connector */}
                    <div className="col" style={{ width: 48, alignItems: "center", flexShrink: 0 }}>
                      <div
                        style={{
                          position: "relative",
                          width: nodeSize, height: nodeSize, borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: nodeBg, border: nodeBorder, flexShrink: 0,
                          marginTop: isCurrent ? 0 : 5,
                        }}
                      >
                        {isCurrent && (
                          <span
                            className="pulse"
                            style={{
                              position: "absolute", inset: -7, borderRadius: "50%",
                              border: "2px solid var(--clay-soft)", pointerEvents: "none",
                            }}
                          />
                        )}
                        {isPast
                          ? <Ico.check s={16} c="#fff" />
                          : isLocked
                            ? <Ico.lock s={15} c="var(--muted)" />
                            : PHASE_ICONS[((p.phase_num ?? i + 1) - 1) % PHASE_ICONS.length]?.(isCurrent ? 22 : 17, iconColor)}
                      </div>
                      {!isLast && (
                        <div
                          style={{
                            flex: 1, minHeight: 24, marginTop: 6, marginBottom: 6,
                            width: isPast ? 2 : 0,
                            background: isPast ? "var(--moss)" : "transparent",
                            borderLeft: isPast ? "none" : "2px dashed var(--line-2)",
                          }}
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 22 }}>
                      {isCurrent ? (
                        <div
                          ref={currentCardRef}
                          className="card card-tap"
                          style={{ padding: 18, cursor: "pointer" }}
                          onClick={() => navigate(`/path/phase/${p.id}`)}
                        >
                          <div className="row between" style={{ alignItems: "flex-start" }}>
                            <div style={{ minWidth: 0 }}>
                              <div className="eyebrow" style={{ fontSize: 11, color: "var(--clay-deep)" }}>
                                Fase actual
                              </div>
                              <div className="title-md serif" style={{ lineHeight: 1.1, marginTop: 2 }}>
                                {p.name}
                              </div>
                            </div>
                            <Ico.chevR s={18} c="var(--muted)" />
                          </div>

                          <div style={{ marginTop: 14 }}>
                            <div className="row between" style={{ marginBottom: 6 }}>
                              <span className="body-sm" style={{ fontSize: 14 }}>Progreso</span>
                              <span className="body-sm num" style={{ fontSize: 14 }}>
                                {p.progressPct}% / {p.threshold_pct}%
                              </span>
                            </div>
                            <div style={{ position: "relative", height: 6, borderRadius: 999, background: "var(--line)", overflow: "visible" }}>
                              <div
                                style={{
                                  height: "100%", width: `${p.progressPct}%`,
                                  background: "var(--ink)", borderRadius: 999,
                                  transformOrigin: "left",
                                  animation: "barGrowX 0.6s ease-out 0.3s both",
                                }}
                              />
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

                          {p.description && <div className="body mt-8">{p.description}</div>}

                          {renderWeekDots(p, activityWeeks, false)}
                        </div>
                      ) : (
                        <div style={{ opacity: isLocked ? 0.55 : 1, paddingTop: 8 }}>
                          <div className="eyebrow" style={{ fontSize: 11 }}>
                            Fase {p.phase_num}{isPast ? " · completada" : ""}
                          </div>
                          <div className="serif" style={{ fontSize: 19, lineHeight: 1.15, marginTop: 2, color: "var(--ink)" }}>
                            {p.name}
                          </div>
                          {renderWeekDots(p, isPast ? activityWeeks : new Set<number>(), isLocked)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Injury switcher — bottom sheet. Portaled to <body> so route-transition
          transforms can't trap it in a stacking context below the tab bar. */}
      {createPortal(
      <AnimatePresence>
        {sheetOpen && data && (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ position: "fixed", inset: 0, background: "rgba(31,58,46,0.40)", zIndex: 200 }}
              onClick={() => setSheetOpen(false)}
            />
            <motion.div
              key="sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
              style={{
                position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 201,
                background: "var(--card)", borderRadius: "26px 26px 0 0",
                padding: "10px 22px calc(24px + var(--sab, 0px))",
                boxShadow: "var(--shadow-2)",
              }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 999, background: "var(--line-2)", margin: "0 auto 16px" }} />
              <div className="eyebrow" style={{ marginBottom: 4 }}>Tus lesiones</div>
              {data.map((d, di) => {
                const active = d.injury.id === sel?.injury.id;
                const cur = d.phases.find(p => p.id === d.current?.id);
                const tot = Math.max(d.current?.phase_num ?? 1, ...d.phases.map(p => p.phase_num ?? 0));
                return (
                  <button
                    key={d.injury.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%",
                      padding: "14px 0", background: "none", border: "none",
                      borderBottom: di < data.length - 1 ? "1px solid var(--line)" : "none",
                      cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                      WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
                    }}
                    onClick={() => { setSelectedId(d.injury.id); setSheetOpen(false); }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="body" style={{ fontWeight: active ? 700 : 500 }}>
                        {d.injury.name}
                      </div>
                      <div className="body-sm mt-4">
                        {cur
                          ? <>Fase {cur.phase_num} de {tot} · <span className="num">{cur.progressPct}%</span> de la fase</>
                          : `Fase – de ${tot}`}
                      </div>
                      {cur && (
                        <div className="bar mt-6" style={{ maxWidth: 180 }}>
                          <span className="bar-fill" style={{ width: `${cur.progressPct}%` }} />
                        </div>
                      )}
                    </div>
                    {active && <Ico.check s={18} c="var(--clay)" />}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body
      )}
    </div>
  );
}
