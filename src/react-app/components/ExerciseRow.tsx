import { useNavigate } from "react-router-dom";
import { Ico } from "./icons";

interface Props {
  id: string;
  name: string;
  detail?: string;
  mins?: number;
  done: boolean;
  phase?: string;
  accent?: string;
}

export function ExerciseRow({ id, name, detail, mins, done, phase, accent = "var(--ink-2)" }: Props) {
  const navigate = useNavigate();
  return (
    <div
      className="card"
      style={{ padding: 14, display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}
      onClick={() => navigate(`/today/exercise/${id}`)}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 999, flexShrink: 0,
        background: done ? "var(--ink)" : "transparent",
        border: done ? "none" : "1.5px dashed var(--line-2)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {done && <Ico.check s={16} c="#EDE6D6" />}
      </div>
      <div className="col" style={{ flex: 1, minWidth: 0 }}>
        <span className="body" style={{
          fontWeight: 600, color: done ? "var(--muted)" : "var(--ink)",
          textDecoration: done ? "line-through" : "none",
        }}>{name}</span>
        {detail && <span className="body-sm" style={{ marginTop: 2 }}>{detail}</span>}
      </div>
      <div className="col" style={{ alignItems: "flex-end", gap: 4 }}>
        {phase && (
          <span className="chip" style={{ background: "transparent", border: "1px solid var(--line)", fontSize: 11, padding: "3px 8px" }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: accent, display: "inline-block" }} />
            {phase}
          </span>
        )}
        {mins && <span className="num body-sm">{mins} min</span>}
      </div>
    </div>
  );
}
