import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDb } from "../hooks/useDb";
import { Ico } from "../components/icons";
import { getExerciseById, type Exercise } from "../../db/queries/exercises";
import { ExerciseLogSheet } from "./ExerciseLogSheet";

export function ExerciseDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const db = useDb();
  const navigate = useNavigate();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [currentSet, setCurrentSet] = useState(1);
  const [timerActive, setTimerActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!db || !id) return;
    getExerciseById(db, id).then(e => setExercise(e));
  }, [db, id]);

  const totalSets = exercise?.sets ?? 3;

  useEffect(() => {
    if (timerActive) {
      intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timerActive]);

  function handleSeriesDone() {
    setTimerActive(false);
    setElapsed(0);
    setShowLog(true);
  }

  function handleLogSaved() {
    setShowLog(false);
    if (currentSet >= totalSets) {
      navigate("/today", { replace: true });
    } else {
      setCurrentSet(s => s + 1);
    }
  }

  const mins = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const secs = (elapsed % 60).toString().padStart(2, "0");

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
            Serie {currentSet} de {totalSets}
          </span>
          <div style={{ width: 30 }} />
        </div>

        {/* Progress pips */}
        <div className="row gap-6" style={{ justifyContent: "center", marginTop: 16 }}>
          {Array.from({ length: totalSets }).map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: 999,
              background: i < currentSet - 1 ? "var(--clay)" : i === currentSet - 1 ? "var(--bone)" : "rgba(237,230,214,0.25)",
            }} />
          ))}
        </div>

        {/* Exercise name */}
        <div style={{ textAlign: "center", marginTop: 40 }}>
          <div className="title-lg serif" style={{ color: "var(--bone)", lineHeight: 1.1 }}>
            {exercise?.name ?? "Ejercicio"}
          </div>
          {exercise?.detail && (
            <div className="body-sm" style={{ color: "rgba(237,230,214,0.65)", marginTop: 8 }}>
              {exercise.detail}
            </div>
          )}
        </div>

        {/* Breathing ring timer */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 40, position: "relative" }}>
          <div className={timerActive ? "pulse" : ""} style={{
            width: 180, height: 180, borderRadius: 999,
            background: timerActive
              ? "radial-gradient(circle, rgba(217,119,87,0.4) 0%, rgba(217,119,87,0) 70%)"
              : "rgba(237,230,214,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ textAlign: "center" }}>
              <div className="num" style={{ fontSize: 48, color: "var(--bone)", lineHeight: 1 }}>
                {mins}:{secs}
              </div>
              {exercise?.duration_s && (
                <div className="body-sm" style={{ color: "rgba(237,230,214,0.5)", marginTop: 4 }}>
                  objetivo {exercise.duration_s}s
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Reps/sets info */}
        {exercise?.reps && (
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <span className="chip" style={{ background: "rgba(237,230,214,0.10)", border: "1px solid rgba(237,230,214,0.15)", color: "var(--bone)", fontSize: 14 }}>
              {exercise.reps} reps
            </span>
          </div>
        )}

        {/* Controls */}
        <div style={{ flex: 1 }} />
        <div className="col gap-12" style={{ marginBottom: 8 }}>
          <button
            className="btn-pill"
            style={{ background: timerActive ? "rgba(237,230,214,0.15)" : "var(--clay)", border: timerActive ? "1px solid rgba(237,230,214,0.2)" : "none" }}
            onClick={() => setTimerActive(t => !t)}
          >
            {timerActive ? <>Pausar <Ico.hand s={16} c="var(--bone)" /></> : <>Iniciar <Ico.play s={16} c="#fff" /></>}
          </button>
          <button
            className="btn-pill ghost"
            style={{ border: "1px solid rgba(237,230,214,0.2)", color: "var(--bone)" }}
            onClick={handleSeriesDone}
          >
            Serie hecha <Ico.check s={16} c="var(--bone)" />
          </button>
        </div>
      </div>

      {/* Exercise log sheet */}
      {showLog && exercise && (
        <ExerciseLogSheet
          exerciseId={exercise.id}
          exerciseName={exercise.name}
          plannedReps={exercise.reps}
          sessionDate={new Date().toISOString().slice(0, 10)}
          onSave={handleLogSaved}
          onClose={() => setShowLog(false)}
        />
      )}
    </div>
  );
}
