import { useNavigate } from "react-router-dom";

type SstState = "pending" | "done";

interface Props {
  state: SstState;
  lastScore?: number;
  preferred?: boolean;
}

export function NudgeSST({ state, lastScore, preferred = false }: Props) {
  const navigate = useNavigate();

  return (
    <div
      className="card mt-20"
      style={{
        padding: 18,
        background: state === "done"
          ? "linear-gradient(135deg, var(--card-soft) 0%, #f0f4f1 100%)"
          : "linear-gradient(135deg, var(--card-soft) 0%, var(--clay-soft) 100%)",
        border: "1px solid var(--clay-soft)",
        cursor: state === "pending" ? "pointer" : "default",
      }}
      onClick={() => state === "pending" && navigate("/today/sst")}
    >
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div className="col gap-6" style={{ flex: 1 }}>
          <span className="eyebrow" style={{ color: "var(--clay-deep)" }}>Test del balón · 5s</span>
          {state === "pending" && (
            <>
              <div className="title-md serif" style={{ lineHeight: 1.05 }}>¿Cómo aprieta hoy?</div>
              <div className="body-sm" style={{ color: "var(--ink-3)" }}>
                {preferred
                  ? "2 min para medir tu fuerza isométrica."
                  : "De preferencia, hacerlo martes y jueves."}
              </div>
            </>
          )}
          {state === "done" && (
            <>
              <div className="title-md serif" style={{ lineHeight: 1.05 }}>Medido hoy ✓</div>
              {lastScore !== undefined && (
                <div className="body-sm" style={{ color: "var(--ink-3)" }}>
                  {lastScore}/10 · {lastScore <= 3 ? "más suelto que la semana pasada" : "sigue trabajando"}
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
          {state === "pending" && (
            <div className="pulse" style={{
              position: "absolute", inset: 6, borderRadius: 999,
              background: "radial-gradient(circle, rgba(217,119,87,0.5) 0%, rgba(217,119,87,0) 70%)",
            }} />
          )}
          <div style={{
            position: "absolute", inset: 16, borderRadius: 999,
            background: state === "done" ? "var(--moss)" : "var(--clay)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontFamily: "var(--font-serif)", fontSize: 22,
          }}>
            {state === "done" ? "✓" : "5s"}
          </div>
        </div>
      </div>
    </div>
  );
}
