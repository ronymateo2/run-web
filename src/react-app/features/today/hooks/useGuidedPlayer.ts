// Feature hook for the voice-guided exercise player. Owns the whole session state
// machine — load exercise, announce cues via TTS, count each phase with the drift-free
// timer, auto-advance phase→rep→set with rests, log the session on finish — so the
// screen renders only.
import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@features/auth/AuthContext";
import { localToday } from "@shared/utils/timezone";
import { useSync } from "@shared/hooks/useSync";
import { unlockAudio } from "@shared/utils/sound";
import { speak, cancelSpeech, speechDone, numberToWords } from "@shared/utils/speech";
import { exerciseRepository, guidedPhases, type Exercise } from "@data/repositories";
import { useCountdown } from "./useCountdown";
import { DEFAULT_RPE } from "./exerciseSets";

export type GuidedScreen = "intro" | "ready" | "run" | "represt" | "done";

// Prep countdown before each series when the exercise has no rest_s configured.
const PREP_DEFAULT_S = 5;

export function useGuidedPlayer(exerciseId: string | undefined) {
  const { user } = useAuth();
  const push = useSync();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [screen, setScreen] = useState<GuidedScreen>("intro");
  const [set, setSet] = useState(1);
  const [rep, setRep] = useState(1);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [flashKey, setFlashKey] = useState(0);
  // Ring sweep is a CSS animation per segment (not 60fps React state): segTotal = the
  // running countdown's duration, segKey remounts the circle so the sweep restarts.
  const [segTotal, setSegTotal] = useState(0);
  const [segKey, setSegKey] = useState(0);
  // Guard so the completion logging runs exactly once.
  const savedRef = useRef(false);
  // Invalidates a pending speech-gated advance when the user stops/leaves mid-wait.
  const advanceEpochRef = useRef(0);

  useEffect(() => {
    if (!exerciseId) return;
    exerciseRepository.getExerciseById(exerciseId).then(setExercise);
  }, [exerciseId]);

  const phases = useMemo(() => exercise ? guidedPhases(exercise) : [], [exercise]);
  const reps = exercise?.reps ?? 1;
  const sets = exercise?.sets ?? 1;
  // Prep countdown between series (not the first): rest_s if set, otherwise a default.
  const prepS = exercise?.rest_s || PREP_DEFAULT_S;
  // Auto-pause between reps (0/null = no pause, reps run back-to-back).
  const repRestS = exercise?.rep_rest_s ?? 0;

  // Start a countdown + arm the ring sweep for it (new segment = remounted circle).
  function run(dur: number, beep?: { freq?: number; count?: number }) {
    setSegTotal(dur);
    setSegKey(k => k + 1);
    timer.start(dur, beep);
  }

  // Announce the phase cue and start its timer. The series itself is announced during the
  // "ready" prep, so here we only prefix the rep number (from rep 2 on) to stay natural.
  function speakAndStart(r: number, p: number) {
    const phase = phases[p];
    if (!phase) return;
    const prefix = p === 0 && r > 1 && reps > 1 ? `${numberToWords(r)}. ` : "";
    speak(prefix + phase.cue);
    run(phase.seconds);
  }

  // Begin a series with a "Prepárate" prep countdown; the first phase starts when it ends.
  // The prep is the gap *between* series, so the very first series skips it and runs at once.
  function startSeries(s: number) {
    setSet(s); setRep(1); setPhaseIdx(0); setScreen("ready");
    speak(`Serie ${numberToWords(s)}. Prepárate.`);
    run(prepS, { freq: 1320, count: 3 });
  }

  // Start a series immediately (no prep) — used for the first series so the exercise
  // doesn't open on a "Prepárate" countdown. Announces the series before the first cue.
  function startSeriesNow(s: number) {
    setSet(s); setRep(1); setPhaseIdx(0); setScreen("run");
    const phase = phases[0];
    if (!phase) return;
    speak(`Serie ${numberToWords(s)}. ${phase.cue}`);
    run(phase.seconds);
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

  // A segment ended → decide the next step: prep→first rep, rest→next rep, next phase,
  // rep rest / next rep, next series, or finish.
  function advance() {
    if (screen === "ready") {
      setScreen("run");
      speakAndStart(1, 0);
      return;
    }
    if (screen === "represt") {
      const r = rep + 1;
      setRep(r); setPhaseIdx(0); setScreen("run");
      speakAndStart(r, 0);
      return;
    }
    if (phaseIdx < phases.length - 1) {
      const p = phaseIdx + 1;
      setPhaseIdx(p);
      speakAndStart(rep, p);
      return;
    }
    if (rep < reps) {
      if (repRestS > 0) {
        setScreen("represt");
        run(repRestS);
      } else {
        const r = rep + 1;
        setRep(r); setPhaseIdx(0);
        speakAndStart(r, 0);
      }
      return;
    }
    if (set < sets) {
      startSeries(set + 1);
      return;
    }
    void finishSession();
  }

  const timer = useCountdown({
    // The ring sweep is a per-segment CSS animation, so we don't need 60fps progress here —
    // only the integer secondsLeft (1Hz). Big win over a multi-minute guided session.
    smooth: false,
    onComplete: () => {
      setFlashKey(k => k + 1);
      // If the voice is still mid-phrase when the timer ends (cue/announcement longer than
      // the programmed seconds), wait for it to finish before advancing — the next speak()
      // would otherwise cut it off mid-word. Resolves immediately when the voice is idle.
      const epoch = ++advanceEpochRef.current;
      void speechDone().then(() => {
        if (epoch === advanceEpochRef.current) advance();
      });
    },
  });

  function begin() {
    unlockAudio(); // gesture unlocks the audio context (iOS) for the scheduled beeps
    savedRef.current = false;
    startSeriesNow(1);
  }

  // Stop the timer + voice and drop any speech-gated advance still in flight.
  function stop() {
    advanceEpochRef.current++;
    timer.stop();
    cancelSpeech();
  }

  // Same cleanup on unmount (no stray wake lock or speech after leaving).
  useEffect(() => {
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    exercise, phases, screen,
    set, sets, rep, reps,
    flashKey, segTotal, segKey, phaseIdx,
    timer, begin, stop,
  };
}
