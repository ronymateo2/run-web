// Voice-guided, hands-free player for rep-hold exercises (e.g. glute bridge: 3×10, hold 3s).
// Each rep runs through the exercise's configured phases (cue + seconds); the voice (TTS)
// announces each phase, a drift-free timer counts it, and it auto-advances phase→rep→set
// with a rest between sets — no tapping. On finish it logs the session as completed.
import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useAuth } from "../auth/AuthContext";
import { localToday } from "../utils/timezone";
import { useSync } from "../hooks/useSync";
import { useCountdown } from "../features/useCountdown";
import { DEFAULT_RPE } from "../features/exerciseSets";
import { unlockAudio } from "../utils/sound";
import { speak, cancelSpeech, numberToWords } from "../utils/speech";
import { Ico } from "../components/icons";
import { BackButton } from "../components/BackButton";
import { ScreenNav } from "../components/ScreenNav";
import { exerciseRepository, parseRepPhases, type Exercise } from "../../data/repositories";

type Screen = "intro" | "run" | "rest" | "done";

export function GuidedExerciseScreen() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const push = useSync();
  const navigate = useNavigate();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [screen, setScreen] = useState<Screen>("intro");
  const [set, setSet] = useState(1);
  const [rep, setRep] = useState(1);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [flashKey, setFlashKey] = useState(0);
  // Guard so the completion logging runs exactly once.
  const savedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    exerciseRepository.getExerciseById(id).then(setExercise);
  }, [id]);

  const phases = useMemo(() => parseRepPhases(exercise?.rep_phases), [exercise]);
  const reps = exercise?.reps ?? 1;
  const sets = exercise?.sets ?? 1;
  const restS = exercise?.rest_s ?? 0;

  // Announce the phase (with a "Serie N / Repetición N" prefix at rep/set boundaries) and
  // start its timer. The default end beep marks the phase change audibly alongside the voice.
  function speakAndStart(s: number, r: number, p: number) {
    const phase = phases[p];
    if (!phase) return;
    const prefix = p === 0
      ? `${r === 1 ? `Serie ${numberToWords(s)}. ` : ""}${reps > 1 ? `${numberToWords(r)}. ` : ""}`
      : "";
    speak(prefix + phase.cue);
    timer.start(phase.seconds);
  }

  async function finishSession() {
    setScreen("done");
    if (savedRef.current || !user || !exercise) return;
    savedRef.current = true;
    const date = localToday(user.timezone);
    const now = Date.now();
    const rpe = exercise.target_rpe ?? DEFAULT_RPE;
    for (let i = 0; i < sets; i++) {
      await exerciseRepository.saveExerciseLog({
        id: `${user.id}:${exercise.id}:${date}:${i}`,
        user_id: user.id,
        exercise_id: exercise.id,
        session_date: date,
        reps_done: reps,
        pain_during: 0,
        rpe,
        load: null,
        band: null,
        set_type: "normal",
        completed_at: now + i,
      });
    }
    push();
  }

  const timer = useCountdown({
    onComplete: () => {
      setFlashKey(k => k + 1);
      // A rest just ended → start the next set.
      if (screen === "rest") {
        const s = set + 1;
        setSet(s); setRep(1); setPhaseIdx(0); setScreen("run");
        speakAndStart(s, 1, 0);
        return;
      }
      // A phase ended → next phase within the rep.
      if (phaseIdx < phases.length - 1) {
        const p = phaseIdx + 1;
        setPhaseIdx(p);
        speakAndStart(set, rep, p);
        return;
      }
      // Last phase of the rep → next rep.
      if (rep < reps) {
        const r = rep + 1;
        setRep(r); setPhaseIdx(0);
        speakAndStart(set, r, 0);
        return;
      }
      // Last rep of the set → rest, then next set (or finish).
      if (set < sets) {
        if (restS > 0) {
          setScreen("rest");
          speak(`Descansa. Prepárate para la serie ${numberToWords(set + 1)}.`);
          timer.start(restS, { freq: 1320, count: 3 });
        } else {
          const s = set + 1;
          setSet(s); setRep(1); setPhaseIdx(0);
          speakAndStart(s, 1, 0);
        }
        return;
      }
      void finishSession();
    },
  });

  // Stop the timer + voice on unmount (no stray wake lock or speech after leaving).
  useEffect(() => {
    return () => { timer.stop(); cancelSpeech(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function begin() {
    unlockAudio(); // gesture unlocks the audio context (iOS) for the scheduled beeps
    setSet(1); setRep(1); setPhaseIdx(0); setScreen("run");
    savedRef.current = false;
    speakAndStart(1, 1, 0);
  }

  function stopAndExit() {
    timer.stop();
    cancelSpeech();
    navigate(`/today/exercise/${id}`, { replace: true });
  }

  const circumference = 2 * Math.PI * 72;
  const strokeDash = circumference * (1 - timer.progress);
  const eyebrow = screen === "rest" ? "DESCANSA" : (phases[phaseIdx]?.cue.toUpperCase() ?? "");
  const noGuide = !!exercise && phases.length === 0;

  return (
    <div className="screen screen-dark">
      {flashKey > 0 && (
        <motion.div
          key={flashKey}
          initial={{ opacity: 0.45 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          style={{ position: "fixed", inset: 0, background: "var(--bone)", pointerEvents: "none", zIndex: 5 }}
        />
      )}
      <ScreenNav back={<BackButton fallbackPath={`/today/exercise/${id}`} color="var(--bone)" />}>
        <span className="eyebrow" style={{ color: "rgba(237,230,214,0.55)" }}>Modo guiado</span>
        <div style={{ width: 34 }} />
      </ScreenNav>
      <div className="screen-body" style={{ paddingBottom: 80, display: "flex", flexDirection: "column", flex: 1 }}>

        {noGuide && (
          <div className="col" style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 20, textAlign: "center" }}>
            <div className="body-sm" style={{ color: "rgba(237,230,214,0.65)", maxWidth: 280 }}>
              Este ejercicio no tiene fases configuradas. Agrégalas en "Editar ejercicio".
            </div>
            <button className="btn-pill alt" style={{ maxWidth: 280 }} onClick={() => navigate(`/today/exercise/${id}`, { replace: true })}>
              Volver
            </button>
          </div>
        )}

        {!noGuide && screen === "intro" && exercise && (
          <div className="col" style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 24, textAlign: "center" }}>
            <div className="title-lg serif" style={{ color: "var(--bone)", lineHeight: 1.1 }}>
              {exercise.name}
            </div>
            <div className="body-sm" style={{ color: "rgba(237,230,214,0.65)", maxWidth: 300, lineHeight: 1.6 }}>
              {sets} {sets === 1 ? "serie" : "series"} × {reps} {reps === 1 ? "rep" : "reps"}. La voz te guía en cada fase: {phases.map(p => p.cue).join(" · ")}.
            </div>
            <button className="btn-pill alt" style={{ width: "100%", maxWidth: 280 }} onClick={begin}>
              Comenzar <Ico.play s={16} c="#fff" />
            </button>
          </div>
        )}

        {!noGuide && (screen === "run" || screen === "rest") && (
          <div className="col" style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 20 }}>
            {/* Per-set pips */}
            <div className="row gap-6">
              {Array.from({ length: sets }).map((_, i) => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: 999,
                  background: i < set - 1 ? "var(--clay)" : i === set - 1 ? "var(--bone)" : "rgba(237,230,214,0.2)",
                }} />
              ))}
            </div>

            {/* Ring timer */}
            <div style={{ position: "relative", width: 180, height: 180 }}>
              <svg width={180} height={180} style={{ position: "absolute", transform: "rotate(-90deg)" }}>
                <circle cx={90} cy={90} r={72} fill="none" stroke="rgba(237,230,214,0.1)" strokeWidth={6} />
                <circle
                  cx={90} cy={90} r={72} fill="none"
                  stroke={screen === "rest" ? "var(--moss)" : "var(--clay)"}
                  strokeWidth={6} strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDash}
                  style={{ transition: "stroke-dashoffset 0.1s linear" }}
                />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div className="num" style={{ fontSize: 52, color: "var(--bone)", lineHeight: 1 }}>
                  {timer.secondsLeft}
                </div>
                <div className="eyebrow" style={{ color: "rgba(237,230,214,0.55)", marginTop: 4 }}>
                  {eyebrow}
                </div>
              </div>
            </div>

            <div className="title-md serif" style={{ color: "var(--bone)", textAlign: "center" }}>
              Serie {set}/{sets} · Rep {rep}/{reps}
            </div>

            <button className="btn-pill" onClick={stopAndExit} style={{ maxWidth: 200 }}>
              Detener <Ico.stop s={16} c="var(--bone)" />
            </button>
          </div>
        )}

        {!noGuide && screen === "done" && (
          <div className="col" style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 24, textAlign: "center" }}>
            <div className="title-lg serif" style={{ color: "var(--bone)", lineHeight: 1.1 }}>
              ¡{sets} {sets === 1 ? "serie" : "series"} completadas!
            </div>
            <button className="btn-pill alt" style={{ width: "100%", maxWidth: 280 }} onClick={() => navigate(`/today/exercise/${id}`, { replace: true })}>
              Listo <Ico.check s={16} c="#fff" />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
