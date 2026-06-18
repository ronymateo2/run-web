// Feature hook for the exercise-detail flow. Owns all data access + the set-row
// state machine (load today's logs / last-session template, edit, complete, add,
// remove, save), keeping the screen render-only. Save soft-deletes removed indices
// and persists uncompleted warmups as structural placeholders.
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useSync } from "../hooks/useSync";
import { localToday } from "../utils/timezone";
import { exerciseRepository, type Exercise } from "../../data/repositories";
import {
  type SetRow,
  type PrevValue,
  DEFAULT_RPE,
  newRow,
  prevByIndex,
  logsToSets,
  templateFromLogs,
  initSetsWithWarmup,
} from "./exerciseSets";

export function useExerciseSession(id: string | undefined) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const push = useSync();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [nextExercise, setNextExercise] = useState<Exercise | null>(null);
  // The session's exercise list, derived from the current exercise's phase (active,
  // sort_order) — same query that builds today's session. No reliance on navigation
  // state or storage, so editing/reloading can't strand "registrar" on the same page.
  const [exerciseIds, setExerciseIds] = useState<string[]>([]);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [prev, setPrev] = useState<Map<number, PrevValue>>(new Map());
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
    let cancelled = false;
    (async () => {
      const e = await exerciseRepository.getExerciseById(id);
      if (cancelled) return;
      setExercise(e);
      if (!e) {
        setExerciseIds([]);
        setNextExercise(null);
        return;
      }
      // Whole phase, in order — the next exercise is simply the one after this id,
      // and "no next" means the session is done.
      const phaseExercises = await exerciseRepository.getExercisesForPhase(e.phase_id);
      if (cancelled) return;
      setExerciseIds(phaseExercises.map(x => x.id));
      const idx = phaseExercises.findIndex(x => x.id === id);
      setNextExercise(idx >= 0 ? (phaseExercises[idx + 1] ?? null) : null);
    })();
    return () => { cancelled = true; };
  }, [id]);

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

  // These are passed to memoized SetCard rows. Stable refs ([] deps, functional setState)
  // so a 1Hz timer tick re-rendering the screen doesn't bust the memo on every row.
  const updateSet = useCallback((i: number, field: "value" | "load" | "painDuring", val: number) => {
    setSets(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  }, []);

  // Set this row's band and autofill any other row that has no band yet (bands rarely
  // differ across a session's sets) — one tap fills them all; the user can still
  // override a row individually afterwards.
  const updateBand = useCallback((i: number, slug: string) => {
    setSets(prev => prev.map((s, idx) => (idx === i || !s.band) ? { ...s, band: slug } : s));
  }, []);

  const toggleCompleted = useCallback((i: number) => {
    setSets(prev => prev.map((s, idx) => idx === i ? { ...s, completed: !s.completed } : s));
  }, []);

  const toggleExpand = useCallback((i: number) => {
    setSets(prev => prev.map((s, idx) => idx === i ? { ...s, expanded: !s.expanded } : s));
  }, []);

  // Copy this set's value/RPE/pain to every LATER set and mark them completed; past sets stay untouched.
  // The source set gets selected too (no-op if already selected).
  const copyToFollowing = useCallback((i: number) => {
    setSets(prev => prev.map((s, idx) =>
      idx > i
        ? { ...s, value: prev[i].value, load: prev[i].load, band: prev[i].band, painDuring: prev[i].painDuring, completed: true }
        : idx === i
        ? { ...s, completed: true }
        : s,
    ));
  }, []);

  // Working sets append at the end; warmups go to the top (rendered before working sets).
  function addSet() {
    setSets(prev => [...prev, newRow("normal", defaultValue)]);
  }
  function addWarmup() {
    setSets(prev => [newRow("warmup", defaultValue), ...prev]);
  }
  const removeSet = useCallback((i: number) => {
    setSets(prev => prev.filter((_, idx) => idx !== i));
  }, []);

  // Band exercises: a completed working set must have a color chosen before saving.
  const missingBand = exercise?.equipment_type === "band"
    && sets.some(s => s.completed && s.type === "normal" && !s.band);
  const canSave = (completedCount > 0 || hadLogs || hasWarmup) && !missingBand;

  // Edit the per-exercise target RPE inline (tap the chip). Persists + syncs; updates
  // local state so the chip reflects it immediately.
  async function setTargetRpe(val: number) {
    if (!exercise) return;
    const updated = { ...exercise, target_rpe: val };
    setExercise(updated);
    await exerciseRepository.saveExercise({
      id: exercise.id, phase_id: exercise.phase_id, name: exercise.name, detail: exercise.detail,
      sets: exercise.sets, reps: exercise.reps, duration_s: exercise.duration_s,
      exercise_type: exercise.exercise_type, sort_order: exercise.sort_order,
      video_url: exercise.video_url, how_to: exercise.how_to, warmup_sets: exercise.warmup_sets,
      archived_at: exercise.archived_at, equipment_type: exercise.equipment_type, target_rpe: val,
      rest_s: exercise.rest_s, rep_phases: exercise.rep_phases, rep_rest_s: exercise.rep_rest_s,
    });
    push();
  }

  async function handleSave() {
    if (!user || !exercise || (completedCount === 0 && !hadLogs && !hasWarmup)) return;
    setSaving(true);
    const sessionDate = localToday(user?.timezone);
    const now = Date.now();
    // Cover removed/unchecked rows too: indices that were saved earlier today but no
    // longer exist (sets.length shrank) get soft-deleted so they stop counting.
    const upper = Math.max(sets.length, loadedCount);
    // RPE is now a per-exercise target, stamped onto every saved set. Equipment value is
    // logged per set, but only the column matching the exercise's equipment_type.
    const targetRpe = exercise.target_rpe ?? DEFAULT_RPE;
    const eqLoad = (row: SetRow) => exercise.equipment_type === "weight" ? row.load : null;
    const eqBand = (row: SetRow) => exercise.equipment_type === "band" ? (row.band ?? null) : null;
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
          rpe: targetRpe,
          load: eqLoad(row),
          band: eqBand(row),
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
      navigate(`/today/exercise/${nextId}`, { replace: true });
    } else {
      navigate(-1);
    }
  }

  function goToNext() {
    const currentIndex = exerciseIds.indexOf(id!);
    const nextId = exerciseIds[currentIndex + 1];
    if (nextId) {
      navigate(`/today/exercise/${nextId}`, { replace: true });
    }
  }

  const saveLabel = saving
    ? "Guardando..."
    : missingBand
    ? "Elige banda en cada serie"
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
    updateBand,
    setTargetRpe,
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
