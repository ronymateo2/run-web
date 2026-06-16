// Feature hook for the exercise-detail flow. Owns all data access + the set-row
// state machine (load today's logs / last-session template, edit, complete, add,
// remove, save), keeping the screen render-only. Save soft-deletes removed indices
// and persists uncompleted warmups as structural placeholders.
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useSync } from "../hooks/useSync";
import { localToday } from "../utils/timezone";
import { exerciseRepository, type Exercise } from "../../data/repositories";
import {
  type SetRow,
  newRow,
  prevByIndex,
  logsToSets,
  templateFromLogs,
  initSetsWithWarmup,
} from "./exerciseSets";

export function useExerciseSession(id: string | undefined) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const push = useSync();
  // Stable identity — a fresh [] fallback per render would refire the effects below forever.
  const exerciseIds: string[] = useMemo(() => location.state?.exerciseIds ?? [], [location.state]);

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [nextExercise, setNextExercise] = useState<Exercise | null>(null);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [prev, setPrev] = useState<Map<number, { value: number; rpe: number }>>(new Map());
  const [hadLogs, setHadLogs] = useState(false);
  // How many set rows were already saved for today (max saved index + 1). On save we
  // soft-delete any of those indices the user has since removed or unchecked.
  const [loadedCount, setLoadedCount] = useState(0);
  // Gate the card list until the async load resolves, so AnimatePresence mounts with the
  // real rows already present (initial={false} then suppresses the enter animation) —
  // otherwise the rows pop/settle in on first open.
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const totalSets = exercise?.sets ?? 3;
  const isTimeBased = !!exercise?.duration_s && !exercise?.reps;
  const defaultValue = isTimeBased ? (exercise?.duration_s ?? 30) : (exercise?.reps ?? 10);
  const completedCount = sets.filter(s => s.completed).length;
  // Warmups are saved but don't count toward the working-set target shown in the footer.
  const workingTotal = sets.filter(s => s.type === "normal").length;
  const workingDone = sets.filter(s => s.type === "normal" && s.completed).length;
  // Warmups persist their structure even uncompleted, so their presence alone is saveable.
  const hasWarmup = sets.some(s => s.type === "warmup");

  useEffect(() => {
    if (!id) return;
    exerciseRepository.getExerciseById(id).then(e => setExercise(e));
    const currentIndex = exerciseIds.indexOf(id);
    const nextId = exerciseIds[currentIndex + 1];
    if (nextId) {
      exerciseRepository.getExerciseById(nextId).then(e => setNextExercise(e));
    } else {
      setNextExercise(null);
    }
  }, [id, exerciseIds]);

  useEffect(() => {
    if (!user || !exercise) return;
    setLoaded(false);
    const sessionDate = localToday(user?.timezone);
    Promise.all([
      exerciseRepository.getLogsForExercise(user.id, exercise.id, sessionDate),
      exerciseRepository.getLastSessionForExercise(user.id, exercise.id, sessionDate),
    ]).then(([todayLogs, last]) => {
      setHadLogs(todayLogs.length > 0);
      setPrev(last ? prevByIndex(last.logs, defaultValue) : new Map());
      if (todayLogs.length > 0) {
        const rows = logsToSets(todayLogs, totalSets, defaultValue);
        setLoadedCount(rows.length);
        setSets(rows);
      } else {
        // First visit of the day: mirror last session's structure (count + warmups),
        // or fall back to the prescribed set count on the very first session ever.
        setLoadedCount(0);
        setSets(
          last && last.logs.length > 0
            ? templateFromLogs(last.logs, totalSets, defaultValue)
            : initSetsWithWarmup(totalSets, exercise.warmup_sets ?? 0, defaultValue),
        );
      }
      setLoaded(true);
    });
  }, [user, exercise]);

  function updateSet(i: number, field: "rpe" | "value" | "painDuring", val: number) {
    setSets(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  }

  function toggleCompleted(i: number) {
    setSets(prev => prev.map((s, idx) => idx === i ? { ...s, completed: !s.completed } : s));
  }

  function toggleExpand(i: number) {
    setSets(prev => prev.map((s, idx) => idx === i ? { ...s, expanded: !s.expanded } : s));
  }

  // Copy this set's value/RPE/pain to every LATER set and mark them completed; past sets stay untouched.
  // The source set gets selected too (no-op if already selected).
  function copyToFollowing(i: number) {
    setSets(prev => prev.map((s, idx) =>
      idx > i
        ? { ...s, value: prev[i].value, rpe: prev[i].rpe, painDuring: prev[i].painDuring, completed: true }
        : idx === i
        ? { ...s, completed: true }
        : s,
    ));
  }

  // Working sets append at the end; warmups go to the top (rendered before working sets).
  function addSet() {
    setSets(prev => [...prev, newRow("normal", defaultValue)]);
  }
  function addWarmup() {
    setSets(prev => [newRow("warmup", defaultValue), ...prev]);
  }
  function removeSet(i: number) {
    setSets(prev => prev.filter((_, idx) => idx !== i));
  }

  const canSave = completedCount > 0 || hadLogs || hasWarmup;

  async function handleSave() {
    if (!user || !exercise || (completedCount === 0 && !hadLogs && !hasWarmup)) return;
    setSaving(true);
    const sessionDate = localToday(user?.timezone);
    const now = Date.now();
    // Cover removed/unchecked rows too: indices that were saved earlier today but no
    // longer exist (sets.length shrank) get soft-deleted so they stop counting.
    const upper = Math.max(sets.length, loadedCount);
    for (let i = 0; i < upper; i++) {
      const logId = `${user.id}:${exercise.id}:${sessionDate}:${i}`;
      const row = sets[i];
      if (row && row.completed) {
        await exerciseRepository.saveExerciseLog({
          id: logId,
          user_id: user.id,
          exercise_id: exercise.id,
          session_date: sessionDate,
          reps_done: row.value,
          pain_during: row.painDuring,
          rpe: row.rpe,
          set_type: row.type,
          completed_at: now + i,
        });
      } else if (row && row.type === "warmup") {
        // Persist an uncompleted warmup as a structural placeholder (completed_at NULL,
        // no values) so its "warmup" type survives a reload instead of reverting to a
        // normal set — warmups are ad-hoc and can't be recovered from the prescription.
        await exerciseRepository.saveExerciseLog({
          id: logId,
          user_id: user.id,
          exercise_id: exercise.id,
          session_date: sessionDate,
          reps_done: null,
          pain_during: null,
          rpe: null,
          set_type: "warmup",
          completed_at: null,
        });
      } else {
        await exerciseRepository.softDeleteExerciseLog(logId);
      }
    }
    push();
    setSaving(false);
    const currentIndex = exerciseIds.indexOf(id!);
    const nextId = exerciseIds[currentIndex + 1];
    if (nextId) {
      navigate(`/today/exercise/${nextId}`, { state: { exerciseIds }, replace: true });
    } else {
      navigate(-1);
    }
  }

  function goToNext() {
    const currentIndex = exerciseIds.indexOf(id!);
    const nextId = exerciseIds[currentIndex + 1];
    if (nextId) {
      navigate(`/today/exercise/${nextId}`, { state: { exerciseIds }, replace: true });
    }
  }

  const saveLabel = saving
    ? "Guardando..."
    : completedCount === 0
    ? hasWarmup
      ? "Guardar calentamiento"
      : hadLogs
      ? "Borrar registro"
      : "Completa al menos una serie"
    : workingDone === workingTotal
    ? "Registrar todas las series"
    : `Registrar ${workingDone} de ${workingTotal} series`;

  return {
    exercise,
    nextExercise,
    exerciseIds,
    sets,
    prev,
    loaded,
    saving,
    isTimeBased,
    completedCount,
    canSave,
    saveLabel,
    updateSet,
    toggleCompleted,
    toggleExpand,
    copyToFollowing,
    addSet,
    addWarmup,
    removeSet,
    handleSave,
    goToNext,
  };
}
