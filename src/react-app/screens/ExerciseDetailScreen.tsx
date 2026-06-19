import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Ico } from "../components/icons";
import { BackButton } from "../components/BackButton";
import { ScreenNav } from "../components/ScreenNav";
import { VideoEmbed } from "../components/VideoEmbed";
import { BottomSheet } from "../components/BottomSheet";
import { ExerciseStatsSheet } from "../components/ExerciseStatsSheet";
import { ExerciseFAB } from "../components/ExerciseFAB";
import { SetCard } from "../components/SetCard";
import { BandPicker } from "../components/BandPicker";
import { EditableNum } from "../components/EditableNum";
import { HowToSheet } from "../components/HowToSheet";
import { useExerciseSession } from "../features/useExerciseSession";
import type { PrevValue } from "../features/exerciseSets";
import { useCountdown } from "../features/useCountdown";
import { cancelSpeech, primeSpeech } from "../utils/speech";
import { cue, preloadCues } from "../utils/cue";
import { unlockAudio } from "../utils/sound";
import { guidedPhases } from "../../data/repositories";

export function ExerciseDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    exercise, nextExercise, exerciseIds, sets, prev, loaded, saving,
    isTimeBased, completedCount, canSave, saveLabel,
    updateSet, updateBand, setTargetRpe, toggleCompleted, toggleExpand, copyToFollowing,
    addSet, addWarmup, removeSet, handleSave, goToNext,
  } = useExerciseSession(id);

  const [videoOpen, setVideoOpen] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  // Which set row is currently swiped open to reveal the delete action.
  const [swipedSet, setSwipedSet] = useState<string | null>(null);
  // Which set row's band picker is open (null = closed).
  const [bandPickerIdx, setBandPickerIdx] = useState<number | null>(null);
  // Inline editor for the per-exercise target RPE (tap the chip).
  const [rpeOpen, setRpeOpen] = useState(false);
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
      if (justFinished != null && nextPendingIndex(justFinished) == null) cue("completado");
    },
  });

  const equipmentType = exercise?.equipment_type ?? "none";

  // Stable refs so the memoized SetCard rows don't re-render on every 1Hz timer tick.
  const startTimer = useCallback((i: number) => {
    const dur = sets[i]?.value ?? exercise?.duration_s ?? 0;
    if (dur <= 0) return;
    // Runs inside the play tap → unlock the shared AudioContext so later clips fired from
    // the timer callback (Descanso/Completado, no gesture) still sound.
    unlockAudio();
    setTimingIndex(i);
    cue("comienza");
    timer.start(dur, { count: 0 });
  }, [sets, exercise, timer.start]);
  const stopTimer = useCallback(() => {
    timer.stop();
    cancelSpeech();
    setTimingIndex(null);
    setRestingIndex(null);
  }, [timer.stop]);

  // Close any other row that's swiped open when a new drag starts (functional setState
  // keeps this ref stable for the memoized rows).
  const handleDragStart = useCallback((uid: string) => {
    setSwipedSet(prev => (prev && prev !== uid ? null : prev));
  }, []);

  // Copy the previous session's value (+ load/band) into this row.
  const handleCopyPrev = useCallback((idx: number, p: PrevValue) => {
    updateSet(idx, "value", p.value);
    if (equipmentType === "weight" && p.load != null) updateSet(idx, "load", p.load);
    if (equipmentType === "band" && p.band) updateBand(idx, p.band);
  }, [updateSet, updateBand, equipmentType]);

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
      setTimingIndex(null);
      setRestingIndex(null);
    };
    // timer.stop is stable (useCallback); only re-run when the exercise id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="screen screen-dark" style={{ position: "relative" }}>
      <ScreenNav back={<BackButton fallbackPath="/today" color="var(--bone)" />}>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setStatsOpen(true)}
          style={{
            background: "none", border: "none", cursor: "pointer", padding: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          aria-label="Ver estadísticas"
        >
          <Ico.chart s={20} c="var(--bone)" />
        </button>
        <button
          onClick={() => navigate(`/today/exercise/${id}/edit`)}
          style={{
            background: "none", border: "none", cursor: "pointer", padding: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          aria-label="Editar ejercicio"
        >
          <Ico.pencil s={20} c="var(--bone)" />
        </button>
      </ScreenNav>
      <div className="screen-body" style={{
        paddingBottom: "calc(160px + env(safe-area-inset-bottom, 0px))",
        display: "flex", flexDirection: "column", flex: 1,
      }}>

        {/* Title */}
        <div style={{ textAlign: "center", marginTop: 8, marginBottom: 20 }}>
          {exerciseIds.length > 1 && id && exerciseIds.indexOf(id) >= 0 && (
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Ejercicio {exerciseIds.indexOf(id) + 1} de {exerciseIds.length}
            </div>
          )}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
          }}>
            <div className="title-xl serif" style={{ color: "var(--bone)", lineHeight: 1.05 }}>
              {exercise?.name ?? "Ejercicio"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              {exercise?.video_url && (
                <button
                  onClick={() => setVideoOpen(true)}
                  aria-label="Ver video"
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: 4,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Ico.video s={32} c="var(--bone)" />
                </button>
              )}
              {exercise?.how_to && (
                <button
                  onClick={() => setHowToOpen(true)}
                  aria-label="Ver instrucciones"
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: 4,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Ico.presentation s={32} c="var(--bone)" />
                </button>
              )}
            </div>
          </div>
          {exercise?.detail && (
            <div className="body" style={{
              color: "rgba(245,240,232,0.80)", marginTop: 10, lineHeight: 1.6,
              maxWidth: 480, marginLeft: "auto", marginRight: "auto",
            }}>
              {exercise.detail}
            </div>
          )}
        </div>

        {/* Protocol chips: constants across sets (hold target per rep, target RPE), so they
            sit above the table instead of in each row. */}
        {exercise && ((!isTimeBased && !!exercise.duration_s) || exercise.target_rpe != null) && (
          <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {!isTimeBased && !!exercise.duration_s && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.04em",
                color: "rgba(245,240,232,0.78)",
                padding: "6px 12px",
                borderRadius: 999,
                background: "rgba(245,240,232,0.05)",
                border: "1px solid rgba(245,240,232,0.10)",
              }}>
                <Ico.timer s={14} c="rgba(245,240,232,0.78)" />
                Mantén <strong style={{ fontWeight: 700 }}>{exercise.duration_s}s</strong> por rep
              </span>
            )}
            {exercise.target_rpe != null && (
              <button
                onClick={() => setRpeOpen(true)}
                aria-label={`RPE objetivo ${exercise.target_rpe}. Editar.`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
                  fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.04em",
                  color: "rgba(245,240,232,0.78)",
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "rgba(245,240,232,0.05)",
                  border: "1px solid rgba(245,240,232,0.10)",
                }}
              >
                RPE objetivo <strong style={{ fontWeight: 700 }}>{exercise.target_rpe}</strong>
                <Ico.pencil s={12} c="rgba(245,240,232,0.55)" />
              </button>
            )}
          </div>
        )}

        {/* Per-set progress strip */}
        {exercise && sets.length > 1 && (
          <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
            {sets.map((s, i) => (
              <span key={i} style={{
                flex: 1, height: 5, borderRadius: 999,
                background: s.completed
                  ? (s.type === "warmup" ? "var(--clay)" : "var(--moss)")
                  : "rgba(245,240,232,0.12)",
                transition: "background 0.3s ease",
              }} />
            ))}
          </div>
        )}

        {/* Set cards */}
        {loaded && exercise && (
          <AnimatePresence initial={false}>
            {sets.map((row, i) => (
              <SetCard
                key={row.uid}
                row={row}
                i={i}
                // Working sets are numbered among themselves; warmups don't consume a number.
                workingNum={sets.slice(0, i + 1).filter(s => s.type === "normal").length}
                isTimeBased={isTimeBased}
                isLast={i === sets.length - 1}
                prevForRow={prev.get(i)}
                equipmentType={equipmentType}
                timing={timingIndex === i}
                resting={restingIndex === i}
                // Stable subscribe/getSeconds refs: the active row's number subscribes to
                // the tick via a leaf, so the screen and the other rows never re-render at 1Hz.
                timerSubscribe={timer.subscribe}
                timerGetSeconds={timer.getSeconds}
                onStartTimer={startTimer}
                onStopTimer={stopTimer}
                swiped={swipedSet === row.uid}
                onSwipe={setSwipedSet}
                onDragStart={handleDragStart}
                onToggleCompleted={toggleCompleted}
                onToggleExpand={toggleExpand}
                onUpdate={updateSet}
                onOpenBand={setBandPickerIdx}
                onCopyPrev={handleCopyPrev}
                onCopyFollowing={copyToFollowing}
                onRemove={removeSet}
              />
            ))}
          </AnimatePresence>
        )}

      </div>

      {/* Footer */}
      {exercise && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          padding: "20px 24px calc(20px + env(safe-area-inset-bottom, 0px))",
          background: "linear-gradient(to top, #111E16 60%, transparent)",
          pointerEvents: "none",
        }}>
          {nextExercise && (
            <motion.button
              onClick={goToNext}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
                padding: "12px 16px",
                marginBottom: 12,
                background: "rgba(245,240,232,0.08)",
                border: "1px solid rgba(245,240,232,0.12)",
                borderRadius: 12,
                cursor: "pointer",
                pointerEvents: "auto",
              }}
            >
              <span style={{
                fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.1em",
                color: "rgba(245,240,232,0.50)", textTransform: "uppercase",
              }}>
                Siguiente
              </span>
              <span style={{
                fontSize: 13,
                color: "var(--bone)",
                fontWeight: 500,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {nextExercise.name}
              </span>
              <Ico.arrow s={16} c="var(--bone)" />
            </motion.button>
          )}
          <motion.button
            className="btn-pill"
            onClick={handleSave}
            disabled={saving || !canSave}
            whileTap={canSave && !saving ? { scale: 0.97 } : {}}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            style={{
              opacity: !canSave ? 0.35 : 1,
              pointerEvents: "auto",
            }}
          >
            {saveLabel}
            {!saving && completedCount > 0 && <Ico.check s={16} c="var(--bone)" />}
          </motion.button>
        </div>
      )}

      {/* FAB: add set / warmup / guided mode (when the exercise has voice phases) */}
      <ExerciseFAB
        onAddSet={addSet}
        onAddWarmup={addWarmup}
        onGuided={
          exercise && guidedPhases(exercise).length > 0
            ? () => navigate(`/today/exercise/${id}/guided`)
            : undefined
        }
        hasNextExercise={!!nextExercise}
        visible={!!exercise}
      />

      {/* Inline editor for the per-exercise target RPE */}
      {rpeOpen && exercise && (
        <BottomSheet variant="dark" onClose={() => setRpeOpen(false)}>
          {() => (
            <div style={{
              padding: "8px 16px calc(28px + env(safe-area-inset-bottom, 0px))",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
            }}>
              <div style={{
                fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.12em",
                color: "rgba(245,240,232,0.55)", textTransform: "uppercase",
              }}>
                RPE objetivo
              </div>
              <EditableNum
                value={exercise.target_rpe ?? 6}
                min={1}
                max={10}
                completed
                onChange={(v) => setTargetRpe(v)}
                size={40}
              />
              <div style={{
                fontSize: 12, color: "rgba(245,240,232,0.50)", textAlign: "center", maxWidth: 260,
              }}>
                Esfuerzo percibido (1–10) para todas las series de este ejercicio.
              </div>
            </div>
          )}
        </BottomSheet>
      )}

      {/* Band picker for one set row */}
      {bandPickerIdx != null && sets[bandPickerIdx] && (
        <BandPicker
          selected={sets[bandPickerIdx].band}
          onSelect={(slug) => updateBand(bandPickerIdx, slug)}
          onClose={() => setBandPickerIdx(null)}
        />
      )}

      {/* How-to sheet */}
      {howToOpen && !!exercise?.how_to && (
        <HowToSheet
          content={exercise.how_to}
          onClose={() => setHowToOpen(false)}
        />
      )}

      {/* Video sheet */}
      {videoOpen && !!exercise?.video_url && (
        <BottomSheet variant="dark" size="video" onClose={() => setVideoOpen(false)}>
          {(close) => (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 16px", flexShrink: 0,
              }}>
                <span style={{
                  fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.12em",
                  color: "rgba(245,240,232,0.55)",
                }}>
                  VIDEO
                </span>
                <button
                  onClick={close}
                  aria-label="Cerrar"
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: 4,
                    display: "flex", alignItems: "center",
                  }}
                >
                  <Ico.close s={20} c="rgba(245,240,232,0.70)" />
                </button>
              </div>
              <div style={{
                flex: 1,
                minHeight: 0,
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
              }}>
                <VideoEmbed url={exercise.video_url!} variant="full" />
              </div>
            </div>
          )}
        </BottomSheet>
      )}

      {/* Stats sheet */}
      {statsOpen && exercise && (
        <ExerciseStatsSheet
          exercise={exercise}
          onClose={() => setStatsOpen(false)}
        />
      )}
    </div>
  );
}
