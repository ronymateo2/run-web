import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { localToday } from "../utils/timezone";
import { useSync } from "../hooks/useSync";
import { useCountdown } from "../features/useCountdown";
import { Ico } from "../components/icons";
import { BackButton } from "../components/BackButton";
import { ScreenNav } from "../components/ScreenNav";
import { injuryRepository, sstRepository } from "../../data/repositories";

type Phase = "intro" | "active" | "rest" | "done";

const SQUEEZE_DURATION = 5;
const REST_DURATION = 3;
const TOTAL_SETS = 5;

export function SqueezeTestScreen() {
  const { user } = useAuth();
  const push = useSync();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("intro");
  const [currentSet, setCurrentSet] = useState(1);
  const [painScore, setPainScore] = useState(0);
  const [strengthScore, setStrengthScore] = useState(5);
  const [showResult, setShowResult] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Bumped on every phase transition to retrigger the screen flash.
  const [flashKey, setFlashKey] = useState(0);

  const { secondsLeft, progress, start } = useCountdown({ onComplete: handlePhaseComplete });

  // Drive the squeeze/rest/done state machine off the timer's completion. Replicates the
  // original transitions; the countdown handles timing (drift-free) + the end beep.
  function handlePhaseComplete() {
    setFlashKey(k => k + 1);
    if (phase === "active") {
      if (currentSet >= TOTAL_SETS) {
        setPhase("done");
      } else {
        setPhase("rest");
        start(REST_DURATION);
      }
    } else {
      setCurrentSet(s => s + 1);
      setPhase("active");
      start(SQUEEZE_DURATION);
    }
  }

  async function handleSave() {
    if (!user) {
      setSaveError("Sesión no disponible. Recarga la app.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const injuries = await injuryRepository.getActiveInjuries(user.id);
      const focus = await injuryRepository.getTodayFocusInjury(injuries);
      if (!focus) {
        setSaveError("No hay lesión activa registrada. Contacta soporte.");
        setSaving(false);
        return;
      }
      await sstRepository.saveSstResult({
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

  const circumference = 2 * Math.PI * 72;
  const strokeDash = circumference * (1 - progress);

  return (
    <div className="screen screen-dark">
      {/* Visual cue on each phase transition (third signal alongside beep + ring). */}
      {flashKey > 0 && (
        <div
          key={flashKey}
          style={{
            position: "fixed", inset: 0, background: "var(--bone)", pointerEvents: "none", zIndex: 5,
            animation: "flashFade 0.45s ease-out both",
          }}
        />
      )}
      <ScreenNav back={<BackButton fallbackPath="/today" color="var(--bone)" />}>
        <span className="eyebrow" style={{ color: "rgba(237,230,214,0.55)" }}>
          5-Second Squeeze Test
        </span>
        <div style={{ width: 34 }} />
      </ScreenNav>
      <div className="screen-body" style={{ paddingBottom: 80, display: "flex", flexDirection: "column", flex: 1 }}>

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
              onClick={() => { setPhase("active"); start(SQUEEZE_DURATION); }}>
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
                  {secondsLeft}
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
