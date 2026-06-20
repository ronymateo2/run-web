import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { Ico } from "@shared/components/icons";
import { BackButton } from "@shared/components/BackButton";
import { ScreenNav } from "@shared/components/ScreenNav";
import { guidedPhases } from "@data/repositories";
import { ExerciseHeader } from "../components/ExerciseHeader";
import { ProtocolChips } from "../components/ProtocolChips";
import { SetProgressStrip } from "../components/SetProgressStrip";
import { SetCard } from "../components/SetCard";
import { ExerciseFooter } from "../components/ExerciseFooter";
import { ExerciseFAB } from "../components/ExerciseFAB";
import { RpeEditorSheet } from "../components/RpeEditorSheet";
import { VideoSheet } from "../components/VideoSheet";
import { HowToSheet } from "../components/HowToSheet";
import { ExerciseStatsSheet } from "../components/ExerciseStatsSheet";
import { BandPicker } from "../components/BandPicker";
import { useExerciseSession } from "../hooks/useExerciseSession";
import { useExerciseTimer } from "../hooks/useExerciseTimer";
import type { PrevValue } from "../hooks/exerciseSets";

// Which modal sheet is open (mutually exclusive — only one at a time).
type SheetKind = "video" | "howto" | "stats" | "rpe";

// Shared style for the icon buttons in the nav (stats / edit). Same shape as the
// inline style that was duplicated on each button before.
const NAV_ICON_BTN: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", padding: 6,
  display: "flex", alignItems: "center", justifyContent: "center",
};

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

  // Which modal sheet is open (null = all closed). Replaces four separate booleans so
  // the open-sheet state has a single source of truth and can't stack by accident.
  const [openSheet, setOpenSheet] = useState<SheetKind | null>(null);
  // Which set row is currently swiped open to reveal the delete action.
  const [swipedSet, setSwipedSet] = useState<string | null>(null);
  // Which set row's band picker is open (null = closed).
  const [bandPickerIdx, setBandPickerIdx] = useState<number | null>(null);

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
          onClick={() => setOpenSheet("stats")}
          style={NAV_ICON_BTN}
          aria-label="Ver estadísticas"
        >
          <Ico.chart s={20} c="var(--bone)" />
        </button>
        <button
          onClick={() => navigate(`/today/exercise/${id}/edit`)}
          style={NAV_ICON_BTN}
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
              onVideo={() => setOpenSheet("video")}
              onHowTo={() => setOpenSheet("howto")}
            />
            <ProtocolChips
              exercise={exercise}
              isTimeBased={isTimeBased}
              onEditRpe={() => setOpenSheet("rpe")}
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
      {openSheet === "rpe" && exercise && (
        <RpeEditorSheet
          value={exercise.target_rpe ?? 6}
          onChange={setTargetRpe}
          onClose={() => setOpenSheet(null)}
        />
      )}

      {/* Video sheet */}
      {openSheet === "video" && !!exercise?.video_url && (
        <VideoSheet
          url={exercise.video_url!}
          onClose={() => setOpenSheet(null)}
        />
      )}

      {/* How-to sheet */}
      {openSheet === "howto" && !!exercise?.how_to && (
        <HowToSheet
          content={exercise.how_to}
          onClose={() => setOpenSheet(null)}
        />
      )}

      {/* Stats sheet */}
      {openSheet === "stats" && exercise && (
        <ExerciseStatsSheet
          exercise={exercise}
          onClose={() => setOpenSheet(null)}
        />
      )}

      {/* Band picker for one set row */}
      {bandPickerIdx != null && sets[bandPickerIdx] && (
        <BandPicker
          selected={sets[bandPickerIdx].band}
          onSelect={(slug) => updateBand(bandPickerIdx, slug)}
          onClose={() => setBandPickerIdx(null)}
        />
      )}
    </div>
  );
}
