// Guided breathing player for active breaks / relaxation. Fully client-side (no backend):
// pick a mode + duration, then a circle expands/contracts in time with each breath phase,
// with optional soft tones and TTS voice cues. Reuses the app's drift-free timer the same
// way GuidedExerciseScreen does: ONE useCountdown, a state machine in onComplete.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCountdown, useCountdownSeconds } from "@features/today/hooks/useCountdown";
import { unlockAudio, scheduleBeep } from "@shared/utils/sound";
import { speak, cancelSpeech, speechSupported, primeSpeech } from "@shared/utils/speech";
import { Ico } from "@shared/components/icons";
import { BackButton } from "@shared/components/BackButton";
import { ScreenNav } from "@shared/components/ScreenNav";
import {
  MODES, DURATIONS, modeBySlug, toneFor, fmtDuration,
  loadConfig, saveConfig, type BreatheConfig,
} from "../hooks/breatheModes";

type Screen = "setup" | "run" | "done";

const CIRCLE = 240; // px — base diameter; phases animate transform: scale()

export function BreatheScreen() {
  const navigate = useNavigate();

  const [cfg, setCfg] = useState<BreatheConfig>(loadConfig);
  const [screen, setScreen] = useState<Screen>("setup");
  const [step, setStep] = useState<"mode" | "config">("mode"); // setup is split in two steps
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [scale, setScale] = useState(0.45);
  const [transition, setTransition] = useState("none");

  const mode = modeBySlug(cfg.modeSlug);
  const phases = mode.phases;
  const sessionEndRef = useRef(0);
  // Latest config in a ref so the timer's onComplete (created once) reads current toggles.
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  useEffect(() => { primeSpeech(); }, []);

  // Apply a phase's visuals + cues and start its countdown. The ease curve auto-collapses
  // to an instant frame under prefers-reduced-motion (global rule in tokens.css).
  function startPhase(i: number) {
    const phase = phases[i];
    if (!phase) return;
    setPhaseIdx(i);
    setTransition(`transform ${phase.seconds}s ${phase.kind === "hold" ? "linear" : "ease-in-out"}`);
    setScale(phase.scale);
    if (cfgRef.current.sound) scheduleBeep(0, toneFor(phase.kind));
    if (cfgRef.current.voice && speechSupported()) speak(phase.label);
    timer.start(phase.seconds);
  }

  const timer = useCountdown({
    smooth: false,
    onComplete: () => {
      if (performance.now() >= sessionEndRef.current) { finish(); return; }
      startPhase((phaseIdx + 1) % phases.length);
    },
  });

  // Drives a 1Hz re-render of this component (each phase second ticks). We don't show the
  // phase seconds — we derive the total session time left from sessionEndRef below.
  const phaseSecond = useCountdownSeconds(timer);
  const totalLeft = screen === "run"
    ? Math.max(0, Math.ceil((sessionEndRef.current - performance.now()) / 1000))
    : 0;
  void phaseSecond; // referenced only to re-render on each tick

  function finish() {
    timer.stop();
    cancelSpeech();
    setScreen("done");
  }

  function begin() {
    unlockAudio(); // gesture unlocks the audio context (iOS) for the scheduled tones
    saveConfig(cfg);
    sessionEndRef.current = performance.now() + cfg.durationSec * 1000;
    setScreen("run");
    startPhase(0);
  }

  function stopAndExit() {
    timer.stop();
    cancelSpeech();
    navigate("/today", { replace: true });
  }

  // Stop the timer + voice on unmount (no stray wake lock or speech after leaving).
  useEffect(() => {
    return () => { timer.stop(); cancelSpeech(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phaseLabel = phases[phaseIdx]?.label ?? "";

  return (
    <div className="screen screen-dark">
      <ScreenNav back={<BackButton fallbackPath="/today" color="var(--bone)" />}>
        <span className="eyebrow">Respira</span>
        <div style={{ width: 34 }} />
      </ScreenNav>

      <div className="screen-body" style={{ paddingBottom: 40, display: "flex", flexDirection: "column", flex: 1 }}>

        {/* STEP 1 — pick the breathing type */}
        {screen === "setup" && step === "mode" && (
          <div className="col" style={{ flex: 1, gap: 18, paddingTop: 8 }}>
            <div className="title-lg serif" style={{ color: "var(--bone)" }}>
              Elige tu <em style={{ fontStyle: "italic", color: "var(--clay-soft)" }}>respiración</em>.
            </div>

            <div className="col gap-8">
              {MODES.map((m) => {
                const active = m.slug === cfg.modeSlug;
                return (
                  <button
                    key={m.slug}
                    onClick={() => { setCfg((c) => ({ ...c, modeSlug: m.slug })); setStep("config"); }}
                    style={{
                      display: "flex", flexDirection: "column", gap: 4, textAlign: "left",
                      padding: "12px 14px", borderRadius: 14, cursor: "pointer",
                      background: active ? "rgba(245,240,232,0.10)" : "rgba(245,240,232,0.04)",
                      border: `1px solid ${active ? "rgba(245,240,232,0.30)" : "rgba(245,240,232,0.09)"}`,
                    }}
                  >
                    <div className="row gap-8" style={{ alignItems: "center" }}>
                      <span className="title-md serif" style={{ color: "var(--bone)", fontSize: 20 }}>{m.name}</span>
                      <span style={{
                        fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.06em",
                        padding: "2px 8px", borderRadius: 999, textTransform: "uppercase",
                        background: m.tag === "easy" ? "var(--clay)" : "rgba(245,240,232,0.14)",
                        color: m.tag === "easy" ? "#fff" : "rgba(245,240,232,0.7)",
                      }}>{m.tag === "easy" ? "suave" : "reto"}</span>
                    </div>
                    <span className="body-sm" style={{ color: "rgba(245,240,232,0.55)" }}>{m.blurb}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2 — duration, cues, start */}
        {screen === "setup" && step === "config" && (
          <div className="col" style={{ flex: 1, gap: 24, paddingTop: 8 }}>
            {/* Chosen mode header — tap to go back to the list */}
            <button
              onClick={() => setStep("mode")}
              className="row gap-10"
              style={{
                alignItems: "center", textAlign: "left", cursor: "pointer",
                padding: "12px 14px", borderRadius: 14,
                background: "rgba(245,240,232,0.06)", border: "1px solid rgba(245,240,232,0.12)",
              }}
            >
              <Ico.chevL s={18} c="rgba(245,240,232,0.7)" />
              <div className="col" style={{ flex: 1 }}>
                <span className="title-md serif" style={{ color: "var(--bone)", fontSize: 20 }}>{mode.name}</span>
                <span className="body-sm" style={{ color: "rgba(245,240,232,0.55)" }}>{mode.blurb}</span>
              </div>
              <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.08em", color: "rgba(245,240,232,0.5)", textTransform: "uppercase" }}>Cambiar</span>
            </button>

            {/* Duration */}
            <div className="col gap-10">
              <div className="eyebrow">Duración</div>
              <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                {DURATIONS.map((d) => {
                  const active = d === cfg.durationSec;
                  return (
                    <button
                      key={d}
                      onClick={() => setCfg((c) => ({ ...c, durationSec: d }))}
                      className="num"
                      style={{
                        padding: "10px 18px", borderRadius: 999, cursor: "pointer", fontSize: 16,
                        background: active ? "var(--bone)" : "rgba(245,240,232,0.06)",
                        color: active ? "var(--ink)" : "var(--bone)",
                        border: `1px solid ${active ? "var(--bone)" : "rgba(245,240,232,0.12)"}`,
                      }}
                    >
                      {fmtDuration(d)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cues */}
            <div className="col gap-10">
              <div className="eyebrow">Guía</div>
              <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                <CueToggle label="Tono" on={cfg.sound} onToggle={() => setCfg((c) => ({ ...c, sound: !c.sound }))} />
                <CueToggle
                  label="Voz" on={cfg.voice}
                  disabled={!speechSupported()}
                  onToggle={() => setCfg((c) => ({ ...c, voice: !c.voice }))}
                />
              </div>
            </div>

            <button className="btn-pill alt" style={{ marginTop: "auto" }} onClick={begin}>
              Comenzar <Ico.play s={16} c="var(--ink)" />
            </button>
          </div>
        )}

        {screen === "run" && (
          <div className="col center" style={{ flex: 1, gap: 36 }}>
            <div className="num" style={{ color: "rgba(245,240,232,0.55)", fontSize: 15 }}>
              {fmtDuration(totalLeft)}
            </div>

            {/* Breathing guide circle */}
            <div style={{ position: "relative", width: CIRCLE, height: CIRCLE, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{
                position: "absolute", width: CIRCLE, height: CIRCLE, borderRadius: "50%",
                background: "radial-gradient(circle at 50% 40%, rgba(217,119,87,0.55), rgba(217,119,87,0.12))",
                border: "1px solid rgba(245,240,232,0.18)",
                transform: `scale(${scale})`, transition,
                willChange: "transform",
              }} />
              <div className="serif" style={{ position: "relative", color: "var(--bone)", fontSize: 26 }}>
                {phaseLabel}
              </div>
            </div>

            <button className="btn-pill" style={{ maxWidth: 200 }} onClick={stopAndExit}>
              Detener <Ico.stop s={16} c="var(--ink)" />
            </button>
          </div>
        )}

        {screen === "done" && (
          <div className="col center" style={{ flex: 1, gap: 24, textAlign: "center" }}>
            <div className="title-lg serif" style={{ color: "var(--bone)", lineHeight: 1.1 }}>
              Pausa completa.
            </div>
            <div className="body-sm" style={{ color: "rgba(245,240,232,0.6)", maxWidth: 280 }}>
              {mode.name} · {fmtDuration(cfg.durationSec)}. Bien hecho.
            </div>
            <div className="col gap-8" style={{ width: "100%", maxWidth: 280 }}>
              <button className="btn-pill alt" onClick={() => { setStep("config"); setScreen("setup"); }}>
                Otra vez <Ico.refresh s={16} c="var(--ink)" />
              </button>
              <button className="btn-pill" onClick={() => navigate("/today", { replace: true })}>
                Listo <Ico.check s={16} c="var(--ink)" />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function CueToggle({ label, on, onToggle, disabled }: { label: string; on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      className="row gap-8"
      style={{
        padding: "8px 14px", borderRadius: 999, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        background: on ? "rgba(245,240,232,0.12)" : "rgba(245,240,232,0.04)",
        border: `1px solid ${on ? "rgba(245,240,232,0.28)" : "rgba(245,240,232,0.10)"}`,
        color: "var(--bone)", fontSize: 14, fontWeight: 600, fontFamily: "var(--font-sans)",
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: 999,
        background: on ? "var(--clay)" : "rgba(245,240,232,0.25)",
      }} />
      {label}
    </button>
  );
}
