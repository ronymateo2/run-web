// Timer/cue state-machine for the exercise-detail flow. Drives the per-set countdown,
// the voice cues (comienza/descanso/completado) and the rest → next-set auto-chaining,
// keeping the screen render-only. Only one set times at a time; when the exercise has
// rest_s, finishing a set chains into a rest countdown that then auto-starts the next
// pending set.
import { useState, useEffect, useCallback } from "react";
import { useCountdown } from "./useCountdown";
import type { SetRow } from "./exerciseSets";
import type { Exercise } from "@data/repositories";
import { cancelSpeech, primeSpeech } from "@shared/utils/speech";
import { cue, preloadCues, unlockCues, releaseCues } from "@shared/utils/cue";

export function useExerciseTimer({
  id, sets, exercise, isTimeBased, toggleCompleted,
}: {
  id: string | undefined;
  sets: SetRow[];
  exercise: Exercise | null;
  isTimeBased: boolean;
  toggleCompleted: (i: number) => void;
}) {
  // For time-based sets: which row's countdown is running (null = none). Only one at a time.
  const [timingIndex, setTimingIndex] = useState<number | null>(null);
  // When the exercise has rest_s, the index of the set that auto-starts once the rest
  // countdown finishes (null = not resting). Drives the "Descanso" pill on that card.
  const [restingIndex, setRestingIndex] = useState<number | null>(null);

  // Next pending (uncompleted) set after `from`, skipping `from` itself (its completion
  // hasn't flushed to `sets` yet inside onComplete). null = nothing left to chain.
  function nextPendingIndex(from: number): number | null {
    for (let j = from + 1; j < sets.length; j++) {
      if (!sets[j]?.completed) return j;
    }
    return null;
  }

  const timer = useCountdown({
    // Only the integer seconds are shown (no ring), so skip 60fps progress updates —
    // the screen re-renders ~1Hz instead of every frame.
    smooth: false,
    onComplete: () => {
      // A rest just ended → auto-start the next set (default beep on its completion).
      if (restingIndex != null) {
        const next = restingIndex;
        setRestingIndex(null);
        startTimer(next);
        return;
      }
      // A set just ended → mark it done, then chain into a rest if configured.
      const justFinished = timingIndex;
      if (justFinished != null && !sets[justFinished]?.completed) toggleCompleted(justFinished);
      setTimingIndex(null);
      const rest = exercise?.rest_s ?? 0;
      if (isTimeBased && rest > 0 && justFinished != null) {
        const next = nextPendingIndex(justFinished);
        if (next != null) {
          setRestingIndex(next);
          // Spoken cue instead of a beep; beep suppressed via count:0.
          cue("descanso");
          timer.start(rest, { count: 0 });
          return;
        }
      }
      // No rest chaining left → say "done" only when no pending sets remain.
      if (justFinished != null && nextPendingIndex(justFinished) == null) cue("completado", true);
    },
  });

  // Stable refs so the memoized SetCard rows don't re-render on every 1Hz timer tick.
  const startTimer = useCallback((i: number) => {
    const dur = sets[i]?.value ?? exercise?.duration_s ?? 0;
    if (dur <= 0) return;
    setTimingIndex(i);
    // Play "comienza" first (in-gesture → self-unlocks its element), THEN unlock the rest so
    // the cues fired later from the timer callback (Descanso/Completado, no gesture) can play.
    // Order matters: unlocking before this would abort the comienza playback.
    cue("comienza");
    unlockCues();
    timer.start(dur, { count: 0 });
  }, [sets, exercise, timer.start]);
  const stopTimer = useCallback(() => {
    timer.stop();
    cancelSpeech();
    releaseCues();
    setTimingIndex(null);
    setRestingIndex(null);
  }, [timer.stop]);

  // This screen stays mounted across exercises (the :id param changes via replace-nav).
  // Kill any running timer when the exercise changes so it can't release the wake lock
  // late or complete a stale set index on the newly loaded exercise.
  useEffect(() => {
    // Pre-render cues (ElevenLabs clips) + warm the Web Speech voice list as fallback so
    // the first play sounds even if a clip failed to load.
    preloadCues();
    primeSpeech();
    return () => {
      timer.stop();
      cancelSpeech();
      releaseCues();
      setTimingIndex(null);
      setRestingIndex(null);
    };
    // timer.stop is stable (useCallback); only re-run when the exercise id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return {
    timingIndex,
    restingIndex,
    startTimer,
    stopTimer,
    subscribe: timer.subscribe,
    getSeconds: timer.getSeconds,
  };
}
