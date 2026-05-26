import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDb } from "../hooks/useDb";
import { useAuth } from "../auth/AuthContext";
import { localToday } from "../utils/timezone";
import { Ico } from "../components/icons";
import { getExerciseById, type Exercise } from "../../db/queries/exercises";
import { ExerciseLogSheet } from "./ExerciseLogSheet";

export function ExerciseDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const db = useDb();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    if (!db || !id) return;
    getExerciseById(db, id).then(e => setExercise(e));
  }, [db, id]);

  const totalSets = exercise?.sets ?? 3;
  const isTimeBased = !!exercise?.duration_s && !exercise?.reps;

  const metricValue = isTimeBased ? exercise?.duration_s : exercise?.reps;
  const metricUnit = isTimeBased ? "s" : "rep";

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

        {/* Metric — series × reps/time */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 24 }}>
          {metricValue != null ? (
            <div style={{
              background: "rgba(245,240,232,0.09)",
              border: "1px solid rgba(245,240,232,0.18)",
              borderRadius: 24,
              padding: "28px 56px",
              textAlign: "center",
            }}>
              <div style={{
                fontSize: 11, fontFamily: "var(--font-mono)",
                textTransform: "uppercase", letterSpacing: "0.12em",
                color: "rgba(245,240,232,0.50)", marginBottom: 10,
              }}>
                objetivo
              </div>
              <div style={{
                fontFamily: "var(--font-mono)", color: "#F5F0E8",
                lineHeight: 1, fontWeight: 500,
                display: "flex", alignItems: "baseline", gap: 6, justifyContent: "center",
              }}>
                <span style={{ fontSize: 52 }}>{totalSets}</span>
                <span style={{ fontSize: 28, color: "rgba(245,240,232,0.45)", fontWeight: 400 }}>×</span>
                <span style={{ fontSize: 52 }}>{metricValue}</span>
                <span style={{ fontSize: 20, color: "rgba(245,240,232,0.55)", fontWeight: 400, alignSelf: "flex-end", paddingBottom: 4 }}>
                  {metricUnit}
                </span>
              </div>
              <div style={{
                fontSize: 11, fontFamily: "var(--font-mono)",
                textTransform: "uppercase", letterSpacing: "0.10em",
                color: "rgba(245,240,232,0.35)", marginTop: 10,
              }}>
                {isTimeBased ? "series × segundos" : "series × repeticiones"}
              </div>
            </div>
          ) : null}
        </div>

        {/* CTA */}
        <div style={{ marginBottom: 8 }}>
          <button className="btn-pill" onClick={() => setShowLog(true)}>
            Registrar ejercicio <Ico.check s={16} c="#fff" />
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
          onSave={() => navigate("/today", { replace: true })}
          onClose={() => setShowLog(false)}
        />
      )}
    </div>
  );
}
