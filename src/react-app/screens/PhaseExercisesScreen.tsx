import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../auth/AuthContext";
import { BackButton } from "../components/BackButton";
import { ScreenNav } from "../components/ScreenNav";
import { ExerciseList, setsDoneMap, countDone } from "../components/ExerciseList";
import { Ico } from "../components/icons";
import { injuryRepository, exerciseRepository, type Phase, type Exercise } from "../../data/repositories";
import { localToday } from "../utils/timezone";

/** Rough minutes for one exercise — mirrors ExerciseList's estimateMins. */
function estimateMins(sets?: number | null, reps?: number | null, duration_s?: number | null): number {
  if (sets && reps) return Math.ceil((sets * reps * 4) / 60);
  if (sets && duration_s) return Math.ceil((sets * duration_s) / 60);
  return 0;
}

interface PhaseExercisesData {
  phase: Phase;
  exercises: Exercise[];
  setsDone: Map<string, number>;
}

export function PhaseExercisesScreen() {
  const { id } = useParams<{ id: string }>();
  const { user, lastSyncAt } = useAuth();
  const [data, setData] = useState<PhaseExercisesData | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    const phase = await injuryRepository.getPhaseById(id);
    if (!phase) return;
    const exercises = await exerciseRepository.getExercisesForPhase(id);
    const today = localToday(user?.timezone);
    const logs = user ? await exerciseRepository.getTodayLogs(user.id, today) : [];
    setData({ phase, exercises, setsDone: setsDoneMap(logs) });
  }, [id, user]);

  useEffect(() => {
    loadData();
  }, [loadData, lastSyncAt]);

  // Toggle the floating progress pill once the header scrolls out of view.
  useEffect(() => {
    const el = screenRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 140);
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [data]);

  // Restore scroll to the exercise the user was last viewing (set in ExerciseRow).
  useEffect(() => {
    if (!data) return;
    const lastId = sessionStorage.getItem("lastExerciseId");
    if (!lastId) return;
    sessionStorage.removeItem("lastExerciseId");
    // Wait for the route push/pop transition (ProtectedRoute) to settle, then
    // do a single smooth scroll — re-centering every frame mid-transition snaps
    // harshly. Polls until the row exists and the transition window has passed.
    const start = performance.now();
    const tick = () => {
      const el = document.querySelector(`[data-exercise-id="${lastId}"]`);
      const settled = performance.now() - start > 480;
      if (el && settled) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (performance.now() - start < 1500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [data]);

  if (!data) return (
    <div className="screen">
      <div className="screen-body" style={{ paddingTop: 32 }}>
        <span className="body-sm">Cargando…</span>
      </div>
    </div>
  );

  const { phase, exercises, setsDone } = data;
  const doneCnt = countDone(exercises, setsDone);
  const total = exercises.length;
  const remaining = total - doneCnt;
  const pct = total ? (doneCnt / total) * 100 : 0;
  const totalMins = exercises.reduce((sum, e) => sum + estimateMins(e.sets, e.reps, e.duration_s), 0);
  const remainingMins = exercises.reduce(
    (sum, e) => (setsDone.get(e.id) ?? 0) >= (e.sets ?? 1) ? sum : sum + estimateMins(e.sets, e.reps, e.duration_s),
    0,
  );

  return (
    <div className="screen" ref={screenRef}>
      <ScreenNav back={<BackButton fallbackPath={`/path/phase/${phase.id}`} color="var(--ink)" />}>
        <div className="eyebrow">Fase {phase.phase_num}</div>
        <div style={{ width: 34 }} />
      </ScreenNav>
      <div className="screen-body" style={{ paddingBottom: 170 }}>

        <div className="mt-20">
          <div className="row between" style={{ alignItems: "baseline" }}>
            <div className="title-md serif">Ejercicios de hoy</div>
            <div className="label num">{doneCnt} / {total}</div>
          </div>

          <div className="row gap-8 mt-4" style={{ alignItems: "center" }}>
            <span className="eyebrow">{total} {total === 1 ? "ejercicio" : "ejercicios"}</span>
            {totalMins > 0 && (
              <>
                <span style={{ width: 3, height: 3, borderRadius: 999, background: "var(--faint)" }} />
                <span className="eyebrow num">≈ {totalMins} min</span>
              </>
            )}
          </div>
        </div>

        <div className="bar mt-12" style={{ background: "rgba(31,58,46,0.08)" }}>
          <div
            className="bar-fill"
            style={{
              width: `${pct}%`,
              background: "var(--moss)",
              transition: "width 0.4s var(--ease-bounce)",
            }}
          />
        </div>

        <ExerciseList exercises={exercises} setsDone={setsDone} />

        {total === 0 && (
          <div style={{ paddingTop: 32, textAlign: "center" }}>
            <span className="body-sm" style={{ color: "var(--muted)" }}>Sin ejercicios para esta fase.</span>
          </div>
        )}
      </div>

      <ProgressPill visible={scrolled && total > 0} done={doneCnt} total={total} remaining={remaining} remainingMins={remainingMins} />
    </div>
  );
}

interface PillProps {
  visible: boolean;
  done: number;
  total: number;
  remaining: number;
  remainingMins: number;
}

/** Glass pill floating above the tab bar; mirrors the back button's scroll glass. */
function ProgressPill({ visible, done, total, remaining, remainingMins }: PillProps) {
  const R = 9;
  const C = 2 * Math.PI * R;
  const frac = total ? done / total : 0;
  const allDone = remaining === 0;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        top: "calc(20px + var(--sat, 0px))",
        zIndex: 60,
        display: "flex",
        justifyContent: "center",
        padding: "0 64px",
        pointerEvents: "none",
      }}
    >
      <AnimatePresence>
        {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.92 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            maxWidth: "100%",
            padding: "8px 16px 8px 8px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.72)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            backdropFilter: "blur(20px) saturate(180%)",
            border: "1px solid rgba(255,255,255,0.55)",
            boxShadow: "0 2px 6px rgba(31,58,46,0.08), 0 16px 36px rgba(31,58,46,0.16)",
          }}
        >
          <div style={{ position: "relative", width: 26, height: 26, flexShrink: 0 }}>
            <svg width={26} height={26} viewBox="0 0 26 26" style={{ transform: "rotate(-90deg)" }}>
              <circle cx={13} cy={13} r={R} fill="none" stroke="rgba(31,58,46,0.12)" strokeWidth={2.5} />
              <motion.circle
                cx={13} cy={13} r={R} fill="none"
                stroke={allDone ? "var(--ink)" : "var(--clay)"}
                strokeWidth={2.5} strokeLinecap="round"
                strokeDasharray={C}
                initial={false}
                animate={{ strokeDashoffset: C * (1 - frac) }}
                transition={{ type: "spring", stiffness: 200, damping: 26 }}
              />
            </svg>
            {allDone && (
              <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Ico.check s={13} c="var(--ink)" />
              </span>
            )}
          </div>

          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={remaining}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="body-sm"
              style={{ fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap" }}
            >
              {allDone
                ? "¡Listo por hoy!"
                : <>Faltan <span className="num" style={{ color: "var(--clay)", fontWeight: 700 }}>{remaining}</span> {remaining === 1 ? "ejercicio" : "ejercicios"}{remainingMins > 0 && <span style={{ color: "var(--muted)", fontWeight: 500 }}> · ≈ {remainingMins} min</span>}</>}
            </motion.span>
          </AnimatePresence>
        </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
