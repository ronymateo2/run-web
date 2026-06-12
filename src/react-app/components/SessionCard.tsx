import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Ico } from "./icons";
import { countDone } from "./ExerciseList";
import type { Exercise, Phase } from "../../data/repositories";

/** Rough minutes for one exercise — mirrors ExerciseList's estimateMins. */
function estimateMins(sets?: number | null, reps?: number | null, duration_s?: number | null): number {
  if (sets && reps) return Math.ceil((sets * reps * 4) / 60);
  if (sets && duration_s) return Math.ceil((sets * duration_s) / 60);
  return 0;
}

/** Donut ring with the done/total fraction in the center. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const size = 68, stroke = 5, r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? done / total : 0;
  const complete = total > 0 && done >= total;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={complete ? "var(--moss)" : "var(--ink)"}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - frac) }}
          transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.15 }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {complete
          ? <Ico.check s={20} c="var(--moss)" />
          : <span className="num serif" style={{ fontSize: 18, color: "var(--ink)" }}>{done}<span style={{ fontSize: 12, color: "var(--muted)" }}>/{total}</span></span>}
      </div>
    </div>
  );
}

interface Props {
  title: string;
  phase: Phase | null;
  exercises: Exercise[];
  setsDone: Map<string, number>;
}

/**
 * Today's session, condensed: progress ring, time left, next exercise, and a
 * "start/continue" CTA. The full exercise list lives behind the phase link.
 */
export function SessionCard({ title, phase, exercises, setsDone }: Props) {
  const navigate = useNavigate();
  const total = exercises.length;
  const done = countDone(exercises, setsDone);
  const pending = exercises.filter(e => (setsDone.get(e.id) ?? 0) < (e.sets ?? 1));
  const next = pending[0] ?? null;
  const minsLeft = pending.reduce((acc, e) => acc + estimateMins(e.sets, e.reps, e.duration_s), 0);
  const started = done > 0 || exercises.some(e => (setsDone.get(e.id) ?? 0) > 0);
  const complete = total > 0 && done >= total;

  const openExercise = (id: string) => {
    sessionStorage.setItem("lastExerciseId", id);
    navigate(`/today/exercise/${id}`, { state: { exerciseIds: exercises.map(e => e.id) } });
  };

  return (
    <motion.div
      className="card mt-16"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.05 }}
      style={{ padding: "16px 16px 14px" }}
    >
      <div className="row gap-16" style={{ alignItems: "center" }}>
        <ProgressRing done={done} total={total} />
        <div className="col gap-4" style={{ flex: 1, minWidth: 0 }}>
          <div className="title-md serif" style={{ lineHeight: 1.05 }}>{title}</div>
          {phase && <div className="eyebrow" style={{ fontSize: 10 }}>{phase.name}</div>}
          <div className="body-sm num">
            {complete
              ? "Sesión completa. Buen trabajo."
              : `${pending.length} ${pending.length === 1 ? "ejercicio" : "ejercicios"}${minsLeft > 0 ? ` · ≈ ${minsLeft} min` : ""}`}
          </div>
        </div>
      </div>

      {!complete && next && (
        <>
          <div className="body-sm mt-12" style={{ color: "var(--ink-3)" }}>
            Siguiente: <span style={{ fontWeight: 600, color: "var(--ink)" }}>{next.name}</span>
          </div>
          <button className="btn-pill mt-12" style={{ height: 46 }} onClick={() => openExercise(next.id)}>
            {started ? "Continuar sesión" : "Empezar sesión"} <Ico.arrow s={15} c="var(--bone)" />
          </button>
        </>
      )}

      {phase && (
        <button
          className="row gap-6"
          onClick={() => navigate(`/path/phase/${phase.id}/exercises`)}
          style={{
            margin: "12px auto 0", padding: "6px 10px",
            background: "none", border: "none", cursor: "pointer",
            fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
            color: "var(--ink-3)", WebkitTapHighlightColor: "transparent",
          }}
        >
          Ver los {total} ejercicios <Ico.arrow s={13} c="var(--ink-3)" />
        </button>
      )}
    </motion.div>
  );
}
