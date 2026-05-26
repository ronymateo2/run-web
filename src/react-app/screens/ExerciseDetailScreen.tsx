import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDb } from "../hooks/useDb";
import { useAuth } from "../auth/AuthContext";
import { useSync } from "../hooks/useSync";
import { localToday } from "../utils/timezone";
import { Ico } from "../components/icons";
import { getExerciseById, saveExerciseLog, type Exercise } from "../../db/queries/exercises";
import { ExerciseLogSheet } from "./ExerciseLogSheet";

const DEFAULT_RPE = 6;

export function ExerciseDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const db = useDb();
  const { user } = useAuth();
  const navigate = useNavigate();
  const push = useSync();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [showLog, setShowLog] = useState<false | "edit" | "done">(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!db || !id) return;
    getExerciseById(db, id).then(e => setExercise(e));
  }, [db, id]);

  const totalSets = exercise?.sets ?? 3;
  const isTimeBased = !!exercise?.duration_s && !exercise?.reps;
  const defaultValue = isTimeBased ? (exercise?.duration_s ?? 30) : (exercise?.reps ?? 10);
  const metricUnit = isTimeBased ? "s" : "rep";

  async function handleQuickSave() {
    if (!db || !user || !exercise) return;
    setSaving(true);
    const now = Date.now();
    for (let i = 0; i < totalSets; i++) {
      await saveExerciseLog(db, {
        id: crypto.randomUUID(),
        user_id: user.id,
        exercise_id: exercise.id,
        session_date: localToday(user?.timezone),
        reps_done: defaultValue,
        pain_during: 0,
        rpe: DEFAULT_RPE,
        completed_at: now + i,
      });
    }
    push();
    setSaving(false);
    setShowLog("done");
  }

  return (
    <div className="screen screen-dark" style={{ position: "relative" }}>
      <div className="screen-body" style={{
        paddingBottom: 100, paddingTop: 24,
        display: "flex", flexDirection: "column", flex: 1,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            <Ico.chevL s={22} c="var(--bone)" />
          </button>
        </div>

        {/* Exercise name */}
        <div style={{ textAlign: "center", marginTop: 40 }}>
          <div className="title-xl serif" style={{ color: "#F5F0E8", lineHeight: 1.05 }}>
            {exercise?.name ?? "Ejercicio"}
          </div>
          {exercise?.detail && (
            <div className="body" style={{
              color: "rgba(245,240,232,0.70)", marginTop: 14, lineHeight: 1.6,
              maxWidth: 480, marginLeft: "auto", marginRight: "auto",
            }}>
              {exercise.detail}
            </div>
          )}
        </div>

        {/* Metric chips + RPE */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          marginTop: 32, marginBottom: 32,
        }}>
          {exercise != null ? (
            <>
              <div style={{ display: "flex", gap: 12 }}>
                {/* Series chip */}
                <div style={{
                  background: "rgba(245,240,232,0.09)",
                  border: "1px solid rgba(245,240,232,0.15)",
                  borderRadius: 20,
                  padding: "24px 36px",
                  textAlign: "center",
                  minWidth: 100,
                }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 52, color: "#F5F0E8", lineHeight: 1, fontWeight: 500 }}>
                    {totalSets}
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(245,240,232,0.55)", marginTop: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                    series
                  </div>
                </div>

                {/* Reps / time chip */}
                <div style={{
                  background: "rgba(245,240,232,0.09)",
                  border: "1px solid rgba(245,240,232,0.15)",
                  borderRadius: 20,
                  padding: "24px 36px",
                  textAlign: "center",
                  minWidth: 100,
                }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 52, color: "#F5F0E8", lineHeight: 1, fontWeight: 500 }}>
                    {defaultValue}
                    <span style={{ fontSize: 22, color: "rgba(245,240,232,0.60)", fontWeight: 400, marginLeft: 3 }}>{metricUnit}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(245,240,232,0.55)", marginTop: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                    {isTimeBased ? "segundos" : "repeticiones"}
                  </div>
                </div>
              </div>

              {/* RPE badge */}
              <div style={{ marginTop: 16 }}>
                <div style={{
                  background: "rgba(245,240,232,0.09)",
                  border: "1px solid rgba(245,240,232,0.15)",
                  borderRadius: 999,
                  padding: "6px 18px",
                  fontSize: 13,
                  color: "rgba(245,240,232,0.75)",
                  fontFamily: "var(--font-mono)",
                }}>
                  Cómodo · RPE 6–7
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* CTA buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
          <button
            className="btn-pill"
            onClick={handleQuickSave}
            disabled={saving || !exercise}
            style={{ opacity: saving || !exercise ? 0.6 : 1 }}
          >
            {saving ? "Guardando..." : "Registrar todo como el plan"}
            {!saving && <Ico.check s={16} c="var(--bone)" />}
          </button>
          <button
            onClick={() => setShowLog("edit")}
            disabled={!exercise}
            style={{
              width: "100%", height: 52, borderRadius: 999,
              border: "1.5px solid rgba(245,240,232,0.30)",
              background: "transparent",
              color: "rgba(245,240,232,0.85)",
              fontSize: 15, fontWeight: 600,
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: !exercise ? 0.5 : 1,
            }}
          >
            Registrar con modificaciones
          </button>
        </div>
      </div>

      {showLog && exercise && (
        <ExerciseLogSheet
          exerciseId={exercise.id}
          exerciseName={exercise.name}
          sets={totalSets}
          plannedReps={exercise.reps}
          plannedDurationS={exercise.duration_s}
          sessionDate={localToday(user?.timezone)}
          mode={showLog}
          onSave={() => navigate("/today", { replace: true })}
          onClose={() => setShowLog(false)}
        />
      )}
    </div>
  );
}
