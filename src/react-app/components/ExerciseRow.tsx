import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Ico } from "./icons";

interface Props {
  id: string;
  name: string;
  detail?: string;
  sets?: number;
  reps?: number;
  duration_s?: number;
  mins?: number;
  done: boolean;
  setsDone?: number;
  setsTotal?: number;
  phase?: string;
  accent?: string;
  exerciseIds?: string[];
}

export function ExerciseRow({ id, name, sets, reps, duration_s, mins, done, setsDone = 0, setsTotal = 0, phase, accent = "var(--ink-2)", exerciseIds }: Props) {
  const navigate = useNavigate();
  const partial = !done && setsDone > 0 && setsDone < setsTotal;
  const remaining = setsTotal - setsDone;
  return (
    <motion.div
      className="card"
      data-exercise-id={id}
      whileTap={{ scale: 0.975 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      style={{ padding: 14, display: "flex", alignItems: "center", gap: 14, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
      onClick={() => {
        sessionStorage.setItem("lastExerciseId", id);
        navigate(`/today/exercise/${id}`, { state: { exerciseIds } });
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 999, flexShrink: 0,
        background: done ? "var(--ink)" : "transparent",
        border: done ? "none" : partial ? "1.5px solid var(--clay)" : "1.5px dashed var(--line-2)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {done
          ? <Ico.check s={16} c="#EDE6D6" />
          : partial && (
            <span className="num" style={{ fontSize: 11, fontWeight: 700, color: "var(--clay)" }}>
              {setsDone}/{setsTotal}
            </span>
          )}
      </div>
      <div className="col" style={{ flex: 1, minWidth: 0 }}>
        <span className="body" style={{
          fontWeight: 600, color: done ? "var(--muted)" : "var(--ink)",
          textDecoration: done ? "line-through" : "none",
        }}>{name}</span>
        {partial && (
          <span className="body-sm" style={{ color: "var(--clay)", fontWeight: 600 }}>
            Falta {remaining} {remaining === 1 ? "serie" : "series"}
          </span>
        )}
      </div>
      <div className="col" style={{ alignItems: "flex-end", gap: 4 }}>
        {phase && (
          <span className="chip" style={{ background: "transparent", border: "1px solid var(--line)", fontSize: 11, padding: "3px 8px" }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: accent, display: "inline-block" }} />
            {phase}
          </span>
        )}
        {(sets || reps || duration_s) && (
          <span className="num body-sm" style={{ color: "var(--ink-3)" }}>
            {(() => {
              const s = sets ? `${sets} ${sets === 1 ? "serie" : "series"}` : "";
              const r = reps ? `${reps} reps` : "";
              const d = duration_s ? `${duration_s}s` : "";
              if (s && r && d) return `${s} x ${r} | ${d}`;
              if (s && r)      return `${s} x ${r}`;
              if (s && d)      return `${s} x ${d}`;
              if (s)           return s;
              if (r && d)      return `${r} | ${d}`;
              return r || d;
            })()}
          </span>
        )}
        {mins && <span className="num body-sm" style={{ color: "var(--ink-3)" }}>≈ {mins} min</span>}
      </div>
    </motion.div>
  );
}
