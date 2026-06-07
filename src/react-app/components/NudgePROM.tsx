import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Ico } from "./icons";
import type { PromInstrument } from "../../data/repositories";

interface Props {
  instruments: PromInstrument[];
}

// Accent by body region so each questionnaire reads as a distinct, tappable target.
function accentFor(inst: PromInstrument): string {
  return inst.zones.some((z) => z.includes("shoulder") || z.includes("hombro"))
    ? "var(--clay)"
    : "var(--moss)";
}

// "SPADI · Hombro" → { code: "SPADI", label: "Hombro" }
function splitName(name: string): { code: string; label: string } {
  const parts = name.split("·").map((s) => s.trim());
  return parts.length >= 2 ? { code: parts[0], label: parts.slice(1).join(" · ") } : { code: "", label: name };
}

// Shown on Home when validated questionnaires are due. Lists every pending instrument
// as its own row so the user picks which to answer (e.g. only the shoulder one) instead
// of being forced through them in sequence.
export function NudgePROM({ instruments }: Props) {
  const navigate = useNavigate();
  if (instruments.length === 0) return null;

  return (
    <div
      className="card mt-20"
      style={{
        padding: "18px 18px 8px",
        background: "linear-gradient(135deg, var(--card-soft) 0%, #eef0e9 100%)",
        border: "1px solid var(--line)",
      }}
    >
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div className="col gap-6" style={{ flex: 1 }}>
          <span className="eyebrow" style={{ color: "var(--moss)" }}>Cuestionarios · esta semana</span>
          <div className="title-md serif" style={{ lineHeight: 1.05 }}>¿Cómo va la recuperación?</div>
          <div className="body-sm" style={{ color: "var(--ink-3)" }}>
            Elige cuál responder. Cada uno toma ~2 min.
          </div>
        </div>
        <div style={{
          flexShrink: 0, minWidth: 24, height: 24, padding: "0 8px", borderRadius: 999,
          background: "var(--moss)", color: "#fff", fontSize: 12, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {instruments.length}
        </div>
      </div>

      <div className="col" style={{ marginTop: 12 }}>
        {instruments.map((inst, i) => {
          const accent = accentFor(inst);
          const { code, label } = splitName(inst.name);
          return (
            <motion.button
              key={inst.id}
              whileTap={{ scale: 0.985 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              onClick={() => navigate(`/today/prom/${inst.id}`)}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%",
                padding: "13px 2px", background: "none", border: "none",
                borderTop: i > 0 ? "1px solid var(--line)" : "none",
                cursor: "pointer", textAlign: "left", WebkitTapHighlightColor: "transparent",
              }}
            >
              <span style={{ width: 4, alignSelf: "stretch", minHeight: 30, borderRadius: 999, background: accent, flexShrink: 0 }} />
              <div className="col gap-2" style={{ flex: 1, minWidth: 0 }}>
                {code && <span className="eyebrow" style={{ color: accent }}>{code}</span>}
                <span className="body" style={{ fontWeight: 600, color: "var(--ink)" }}>{label}</span>
                <span className="body-sm" style={{ color: "var(--ink-3)" }}>{inst.questions.length} preguntas</span>
              </div>
              <Ico.arrow s={16} c="var(--ink-3)" />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
