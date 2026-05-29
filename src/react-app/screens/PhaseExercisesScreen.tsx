import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useDb } from "../hooks/useDb";
import { Ico } from "../components/icons";
import { ExerciseList, setsDoneMap, countDone } from "../components/ExerciseList";
import { getPhaseById, type Phase } from "../../db/queries/injuries";
import { getExercisesForPhase, getTodayLogs, type Exercise } from "../../db/queries/exercises";
import { localToday } from "../utils/timezone";

interface PhaseExercisesData {
  phase: Phase;
  exercises: Exercise[];
  setsDone: Map<string, number>;
}

export function PhaseExercisesScreen() {
  const { id } = useParams<{ id: string }>();
  const { user, lastSyncAt } = useAuth();
  const db = useDb();
  const navigate = useNavigate();
  const [data, setData] = useState<PhaseExercisesData | null>(null);

  const loadData = useCallback(async () => {
    if (!db || !id) return;
    const phase = await getPhaseById(db, id);
    if (!phase) return;
    const exercises = await getExercisesForPhase(db, id);
    const today = localToday(user?.timezone);
    const logs = user ? await getTodayLogs(db, user.id, today) : [];
    setData({ phase, exercises, setsDone: setsDoneMap(logs) });
  }, [db, id, user]);

  useEffect(() => {
    loadData();
  }, [loadData, lastSyncAt]);

  // Restore scroll to the exercise the user was last viewing (set in ExerciseRow).
  useEffect(() => {
    if (!data) return;
    const lastId = sessionStorage.getItem("lastExerciseId");
    if (!lastId) return;
    sessionStorage.removeItem("lastExerciseId");
    const el = document.querySelector(`[data-exercise-id="${lastId}"]`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "center" }));
  }, [data]);

  if (!data) return (
    <div className="screen">
      <div className="screen-body" style={{ paddingTop: 32 }}>
        <span className="body-sm">Cargando…</span>
      </div>
    </div>
  );

  const { phase, exercises, setsDone } = data;
  const doneCnt = countDone(exercises, setsDone);

  return (
    <div className="screen">
      <div className="screen-body" style={{ paddingBottom: 100 }}>

        <div className="row between mt-4" style={{ alignItems: "center" }}>
          <button
            onClick={() => navigate(`/path/phase/${phase.id}`)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            <Ico.chevL s={22} c="var(--ink)" />
          </button>
          <div className="eyebrow">Fase {phase.phase_num}</div>
          <div style={{ width: 30 }} />
        </div>

        <div className="row between mt-20" style={{ alignItems: "baseline" }}>
          <div className="title-md serif">Ejercicios de hoy</div>
          <div className="label num">{doneCnt} / {exercises.length}</div>
        </div>

        <div className="bar mt-8" style={{ background: "rgba(31,58,46,0.08)" }}>
          <div
            className="bar-fill"
            style={{
              width: `${exercises.length ? (doneCnt / exercises.length) * 100 : 0}%`,
              background: "var(--moss)",
              transition: "width 0.4s ease",
            }}
          />
        </div>

        <ExerciseList exercises={exercises} setsDone={setsDone} />

        {exercises.length === 0 && (
          <div style={{ paddingTop: 32, textAlign: "center" }}>
            <span className="body-sm" style={{ color: "var(--muted)" }}>Sin ejercicios para esta fase.</span>
          </div>
        )}
      </div>
    </div>
  );
}
