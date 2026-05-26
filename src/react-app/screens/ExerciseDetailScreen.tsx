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

  return (
    <div className="screen screen-dark" style={{ position: "relative" }}>
      <div className="screen-body" style={{ paddingBottom: 100, paddingTop: 24, display: "flex", flexDirection: "column", flex: 1 }}>
        {/* Header */}
        <div className="row between" style={{ alignItems: "center" }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            <Ico.chevL s={22} c="var(--bone)" />
          </button>
          <span className="eyebrow" style={{ color: "rgba(237,230,214,0.55)" }}>
            {totalSets} series
          </span>
          <div style={{ width: 30 }} />
        </div>

        {/* Exercise name */}
        <div style={{ textAlign: "center", marginTop: 48 }}>
          <div className="title-lg serif" style={{ color: "var(--bone)", lineHeight: 1.1 }}>
            {exercise?.name ?? "Ejercicio"}
          </div>
          {exercise?.detail && (
            <div className="body-sm" style={{ color: "rgba(237,230,214,0.65)", marginTop: 8 }}>
              {exercise.detail}
            </div>
          )}
        </div>

        {/* Objective card */}
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 48, flexWrap: "wrap" }}>
          <div style={{
            background: "rgba(237,230,214,0.08)", border: "1px solid rgba(237,230,214,0.15)",
            borderRadius: 16, padding: "20px 36px", textAlign: "center",
          }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(237,230,214,0.45)" }}>
              {isTimeBased ? "segundos" : "repeticiones"}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 52, color: "var(--bone)", lineHeight: 1, marginTop: 4 }}>
              {isTimeBased ? exercise?.duration_s : exercise?.reps}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div style={{ flex: 1 }} />
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
