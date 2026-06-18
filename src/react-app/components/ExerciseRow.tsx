import { useNavigate } from "react-router-dom";
import { Ico } from "./icons";

/** "2 series x 10 reps | 30s" — omits absent parts. */
function formatSetsReps(sets?: number, reps?: number, duration_s?: number): string {
  const s = sets ? `${sets} ${sets === 1 ? "serie" : "series"}` : "";
  const r = reps ? `${reps} reps` : "";
  const d = duration_s ? `${duration_s}s` : "";
  if (s && r && d) return `${s} x ${r} | ${d}`;
  if (s && r)      return `${s} x ${r}`;
  if (s && d)      return `${s} x ${d}`;
  if (s)           return s;
  if (r && d)      return `${r} | ${d}`;
  return r || d;
}

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
  exerciseIds?: string[];
  index?: number;
}

export function ExerciseRow({ id, name, sets, reps, duration_s, mins, done, setsDone = 0, setsTotal = 0, exerciseIds, index = 0 }: Props) {
  const navigate = useNavigate();
  const partial = !done && setsDone > 0 && setsDone < setsTotal;
  const remaining = setsTotal - setsDone;
  return (
    <div
      className="card rise press"
      data-exercise-id={id}
      style={{ padding: 14, display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer", WebkitTapHighlightColor: "transparent", animationDelay: `${0.03 + index * 0.045}s` }}
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
      <div className="col gap-6" style={{ flex: 1, minWidth: 0 }}>
        <span className="body" style={{
          fontWeight: 600, color: done ? "var(--muted)" : "var(--ink)",
          textDecoration: done ? "line-through" : "none",
        }}>{name}</span>

        {(sets || reps || duration_s || mins) && (
          <div className="row" style={{ flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 }}>
            {(sets || reps || duration_s) && (
              <span className="num body-sm" style={{ color: "var(--ink-3)" }}>
                {formatSetsReps(sets, reps, duration_s)}
              </span>
            )}
            {mins && (
              <span className="row num body-sm" style={{ alignItems: "center", gap: 8, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                <span style={{ width: 3, height: 3, borderRadius: 999, background: "var(--faint)" }} />
                ≈ {mins} min
              </span>
            )}
          </div>
        )}

        {partial && (
          <span className="body-sm" style={{ color: "var(--clay)", fontWeight: 600 }}>
            Falta {remaining} {remaining === 1 ? "serie" : "series"}
          </span>
        )}
      </div>
    </div>
  );
}
