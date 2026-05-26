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
          <div className="title-xl serif" style={{ color: "#F5F0E8", lineHeight: 1.05 }}>
            {exercise?.name ?? "Ejercicio"}
          </div>
          {exercise?.detail && (
            <div className="body" style={{ color: "rgba(245,240,232,0.80)", marginTop: 12, lineHeight: 1.55 }}>
              {exercise.detail}
            </div>
          )}
        </div>

        {/* Objective card */}
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 48, flexWrap: "wrap" }}>
          <div style={{
            background: "rgba(245,240,232,0.10)", border: "1px solid rgba(245,240,232,0.20)",
            borderRadius: 20, padding: "24px 48px", textAlign: "center",
          }}>
            <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.10em", color: "rgba(245,240,232,0.60)" }}>
              {isTimeBased ? "segundos" : "repeticiones"}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 64, color: "#F5F0E8", lineHeight: 1, marginTop: 8, fontWeight: 500 }}>
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
