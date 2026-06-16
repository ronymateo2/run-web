import { useState } from "react";
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
import { HowToSheet } from "../components/HowToSheet";
import { useExerciseSession } from "../features/useExerciseSession";

export function ExerciseDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    exercise, nextExercise, exerciseIds, sets, prev, loaded, saving,
    isTimeBased, completedCount, canSave, saveLabel,
    updateSet, toggleCompleted, toggleExpand, copyToFollowing,
    addSet, addWarmup, removeSet, handleSave, goToNext,
  } = useExerciseSession(id);

  const [videoOpen, setVideoOpen] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  // Which set row is currently swiped open to reveal the delete action.
  const [swipedSet, setSwipedSet] = useState<string | null>(null);

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

        {/* Protocol chip: static hold target per rep (reps exercise that also has a duration).
            Constant across sets, so it sits above the table instead of in each row. */}
        {exercise && !isTimeBased && !!exercise.duration_s && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
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
                swiped={swipedSet === row.uid}
                onSwipe={setSwipedSet}
                onDragStart={() => {
                  if (swipedSet && swipedSet !== row.uid) setSwipedSet(null);
                }}
                onToggleCompleted={toggleCompleted}
                onToggleExpand={toggleExpand}
                onUpdate={updateSet}
                onCopyPrev={(idx, value, rpe) => { updateSet(idx, "value", value); updateSet(idx, "rpe", rpe); }}
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

      {/* FAB: add set / warmup */}
      <ExerciseFAB
        onAddSet={addSet}
        onAddWarmup={addWarmup}
        hasNextExercise={!!nextExercise}
        visible={!!exercise}
      />

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
