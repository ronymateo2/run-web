import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { Ico } from "@shared/components/icons";
import { BackButton } from "@shared/components/BackButton";
import { ScreenNav } from "@shared/components/ScreenNav";
import { VideoEmbed } from "../components/VideoEmbed";
import { BottomSheet } from "@shared/components/BottomSheet";
import { ExerciseStatsSheet } from "../components/ExerciseStatsSheet";
import { ExerciseFAB } from "../components/ExerciseFAB";
import { SetCard } from "../components/SetCard";
import { BandPicker } from "../components/BandPicker";
import { EditableNum } from "../components/EditableNum";
import { HowToSheet } from "../components/HowToSheet";
import { ExerciseHeader } from "../components/ExerciseHeader";
import { ProtocolChips } from "../components/ProtocolChips";
import { SetProgressStrip } from "../components/SetProgressStrip";
import { ExerciseFooter } from "../components/ExerciseFooter";
import { useExerciseSession } from "../hooks/useExerciseSession";
import { useExerciseTimer } from "../hooks/useExerciseTimer";
import type { PrevValue } from "../hooks/exerciseSets";
import { guidedPhases } from "@data/repositories";

export function ExerciseDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    exercise, nextExercise, exerciseIds, sets, prev, loaded, saving,
    isTimeBased, completedCount, canSave, saveLabel,
    updateSet, updateBand, setTargetRpe, toggleCompleted, toggleExpand, copyToFollowing,
    addSet, addWarmup, removeSet, handleSave, goToNext,
  } = useExerciseSession(id);

  const { timingIndex, restingIndex, startTimer, stopTimer, subscribe, getSeconds } =
    useExerciseTimer({ id, sets, exercise, isTimeBased, toggleCompleted });

  const [videoOpen, setVideoOpen] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  // Which set row is currently swiped open to reveal the delete action.
  const [swipedSet, setSwipedSet] = useState<string | null>(null);
  // Which set row's band picker is open (null = closed).
  const [bandPickerIdx, setBandPickerIdx] = useState<number | null>(null);
  // Inline editor for the per-exercise target RPE (tap the chip).
  const [rpeOpen, setRpeOpen] = useState(false);

  const equipmentType = exercise?.equipment_type ?? "none";

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

        {exercise && (
          <>
            <ExerciseHeader
              exercise={exercise}
              exerciseIds={exerciseIds}
              id={id}
              onVideo={() => setVideoOpen(true)}
              onHowTo={() => setHowToOpen(true)}
            />
            <ProtocolChips
              exercise={exercise}
              isTimeBased={isTimeBased}
              onEditRpe={() => setRpeOpen(true)}
            />
            <SetProgressStrip sets={sets} />
          </>
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
                timerSubscribe={subscribe}
                timerGetSeconds={getSeconds}
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
        <ExerciseFooter
          nextExercise={nextExercise}
          saving={saving}
          canSave={canSave}
          saveLabel={saveLabel}
          completedCount={completedCount}
          onNext={goToNext}
          onSave={handleSave}
        />
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
