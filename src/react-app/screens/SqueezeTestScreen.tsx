import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { localToday } from "../utils/timezone";
import { useDb } from "../hooks/useDb";
import { useSync } from "../hooks/useSync";
import { Ico } from "../components/icons";
import { BackButton } from "../components/BackButton";
import { getActiveInjuries, getTodayFocusInjury } from "../../db/queries/injuries";
import { saveSstResult } from "../../db/queries/sst";

type Phase = "intro" | "active" | "rest" | "done";

const SQUEEZE_DURATION = 5;
const REST_DURATION = 3;
const TOTAL_SETS = 5;

export function SqueezeTestScreen() {
  const { user } = useAuth();
  const db = useDb();
  const push = useSync();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("intro");
  const [currentSet, setCurrentSet] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [painScore, setPainScore] = useState(0);
  const [strengthScore, setStrengthScore] = useState(5);
  const [showResult, setShowResult] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const duration = phase === "active" ? SQUEEZE_DURATION : REST_DURATION;

  useEffect(() => {
    if (phase === "active" || phase === "rest") {
      intervalRef.current = setInterval(() => {
        setElapsed(e => {
          if (e + 1 >= duration) {
            clearInterval(intervalRef.current!);
            if (phase === "active") {
              if (currentSet >= TOTAL_SETS) {
                setPhase("done");
              } else {
                setPhase("rest");
                setElapsed(0);
              }
            } else {
              setCurrentSet(s => s + 1);
              setPhase("active");
              setElapsed(0);
            }
            return 0;
          }
          return e + 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [phase, currentSet, duration]);

  async function handleSave() {
    if (!db || !user) {
      setSaveError("Sesión no disponible. Recarga la app.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const injuries = await getActiveInjuries(db, user.id);
      const focus = getTodayFocusInjury(injuries);
      if (!focus) {
        setSaveError("No hay lesión activa registrada. Contacta soporte.");
        setSaving(false);
        return;
      }
      await saveSstResult(db, {
        id: crypto.randomUUID(),
        user_id: user.id,
        injury_id: focus.id,
        date: localToday(user?.timezone),
        strength_score: strengthScore,
        pain_score: painScore,
      });
      push();
      navigate("/today", { replace: true });
    } catch (err) {
      console.error("[SST] save failed:", err);
      setSaveError("Error al guardar. Intenta de nuevo.");
      setSaving(false);
    }
  }

  const progress = elapsed / duration;
  const circumference = 2 * Math.PI * 72;
  const strokeDash = circumference * (1 - progress);

  return (
    <div className="screen screen-dark">
      <div className="screen-body" style={{ paddingBottom: 80, display: "flex", flexDirection: "column", flex: 1 }}>
        <div className="screen-nav">
          <BackButton fallbackPath="/today" color="var(--bone)" />
          <span className="eyebrow" style={{ color: "rgba(237,230,214,0.55)" }}>
            5-Second Squeeze Test
          </span>
          <div style={{ width: 34 }} />
        </div>

        {phase === "intro" && (
          <div className="col" style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 24, textAlign: "center" }}>
            <div style={{ fontSize: 64 }}>🏐</div>
            <div className="title-lg serif" style={{ color: "var(--bone)", lineHeight: 1.1 }}>
              Test del aprieto de 5 segundos
            </div>
            <div className="body-sm" style={{ color: "rgba(237,230,214,0.65)", maxWidth: 280, lineHeight: 1.6 }}>
              Imagina un balón entre tus rodillas. Aprieta con los aductores lo más fuerte posible por 5 segundos.
              Haremos 5 repeticiones con 3 segundos de descanso.
            </div>
            <button className="btn-pill alt" style={{ width: "100%", maxWidth: 280 }}
              onClick={() => { setPhase("active"); setElapsed(0); }}>
              Comenzar <Ico.play s={16} c="#fff" />
            </button>
          </div>
        )}

        {(phase === "active" || phase === "rest") && (
          <div className="col" style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 20 }}>
            {/* Progress pips */}
            <div className="row gap-6">
              {Array.from({ length: TOTAL_SETS }).map((_, i) => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: 999,
                  background: i < currentSet - 1 ? "var(--clay)" : i === currentSet - 1 ? "var(--bone)" : "rgba(237,230,214,0.2)",
                }} />
              ))}
            </div>

            {/* Ring timer */}
            <div style={{ position: "relative", width: 180, height: 180 }}>
              <svg width={180} height={180} style={{ position: "absolute", transform: "rotate(-90deg)" }}>
                <circle cx={90} cy={90} r={72} fill="none" stroke="rgba(237,230,214,0.1)" strokeWidth={6} />
                <circle
                  cx={90} cy={90} r={72} fill="none"
                  stroke={phase === "active" ? "var(--clay)" : "var(--moss)"}
                  strokeWidth={6} strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDash}
                  style={{ transition: "stroke-dashoffset 0.1s linear" }}
                />
              </svg>
              <div style={{
                position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
              }}>
                <div className="num" style={{ fontSize: 52, color: "var(--bone)", lineHeight: 1 }}>
                  {duration - elapsed}
                </div>
                <div className="eyebrow" style={{ color: "rgba(237,230,214,0.55)", marginTop: 4 }}>
                  {phase === "active" ? "APRIETA" : "DESCANSA"}
                </div>
              </div>
            </div>

            <div className="title-md serif" style={{ color: "var(--bone)", textAlign: "center" }}>
              Serie {currentSet} de {TOTAL_SETS}
            </div>
          </div>
        )}

        {phase === "done" && !showResult && (
          <div className="col" style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 24, textAlign: "center" }}>
            <div className="title-lg serif" style={{ color: "var(--bone)", lineHeight: 1.1 }}>
              ¡{TOTAL_SETS} series completadas!
            </div>
            <div className="body-sm" style={{ color: "rgba(237,230,214,0.65)" }}>
              Dinos cómo te fue.
            </div>
            <button className="btn-pill alt" style={{ width: "100%", maxWidth: 280 }}
              onClick={() => setShowResult(true)}>
              Registrar resultado
            </button>
          </div>
        )}

        {phase === "done" && showResult && (
          <div className="col gap-20" style={{ marginTop: 32 }}>
            <div>
              <div className="body" style={{ fontWeight: 600, color: "var(--bone)", marginBottom: 12 }}>
                Dolor durante el aprieto
              </div>
              <div className="row between" style={{ marginBottom: 8 }}>
                <span className="body-sm" style={{ color: "rgba(237,230,214,0.55)" }}>sin dolor</span>
                <div className="num" style={{ fontSize: 32, color: "var(--bone)", fontFamily: "var(--font-serif)" }}>{painScore}</div>
                <span className="body-sm" style={{ color: "rgba(237,230,214,0.55)" }}>máximo</span>
              </div>
              <input type="range" min={0} max={10} value={painScore}
                onChange={e => setPainScore(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--clay)" }} />
            </div>

            <div>
              <div className="body" style={{ fontWeight: 600, color: "var(--bone)", marginBottom: 12 }}>
                Fuerza percibida
              </div>
              <div className="row between" style={{ marginBottom: 8 }}>
                <span className="body-sm" style={{ color: "rgba(237,230,214,0.55)" }}>muy débil</span>
                <div className="num" style={{ fontSize: 32, color: "var(--bone)", fontFamily: "var(--font-serif)" }}>{strengthScore}</div>
                <span className="body-sm" style={{ color: "rgba(237,230,214,0.55)" }}>muy fuerte</span>
              </div>
              <input type="range" min={1} max={10} value={strengthScore}
                onChange={e => setStrengthScore(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--moss)" }} />
            </div>

            {saveError && (
              <div style={{ color: "var(--clay)", fontSize: 13, textAlign: "center", padding: "4px 0" }}>
                {saveError}
              </div>
            )}
            <button className="btn-pill alt" onClick={handleSave} disabled={saving}
              style={{ opacity: saving ? 0.6 : 1 }}>
              {saving ? "Guardando…" : "Guardar resultado"} {!saving && <Ico.check s={16} c="#fff" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
