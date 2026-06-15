import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLineDown, ClockCounterClockwise } from "@phosphor-icons/react";
import { useAuth } from "../auth/AuthContext";
import { useSync } from "../hooks/useSync";
import { localToday } from "../utils/timezone";
import { Ico } from "../components/icons";
import { BackButton } from "../components/BackButton";
import { ScreenNav } from "../components/ScreenNav";
import { VideoEmbed } from "../components/VideoEmbed";
import { BottomSheet } from "../components/BottomSheet";
import { ExerciseStatsSheet } from "../components/ExerciseStatsSheet";
import { exerciseRepository, type Exercise, type ExerciseLog } from "../../data/repositories";

const DEFAULT_RPE = 6;

const PAIN_LABELS = [
  "Sin dolor", "Muy leve", "Leve", "Leve-mod",
  "Moderado", "Moderado", "Mod-fuerte", "Fuerte",
  "Muy fuerte", "Intenso", "Máximo",
];

type SetType = "normal" | "warmup";

type SetRow = {
  uid: string;       // stable React key so AnimatePresence exits the right row on delete
  type: SetType;
  rpe: number;
  value: number;
  painDuring: number;
  completed: boolean;
  expanded: boolean;
};

let _setUid = 0;
const newUid = () => `set-${++_setUid}`;

function initSets(count: number, defaultValue: number): SetRow[] {
  return Array.from({ length: count }, () => ({
    uid: newUid(),
    type: "normal" as SetType,
    rpe: DEFAULT_RPE,
    value: defaultValue,
    painDuring: 0,
    completed: false,
    expanded: false,
  }));
}

// Set index is the last segment of the log id (`${user}:${exercise}:${date}:${i}`),
// so logs land on their real set row even when completion is non-contiguous.
function parseSetIdx(log: ExerciseLog): number {
  return Number(log.id.split(":").pop());
}

// Previous session's reps·RPE keyed by set index, for the ghost "PREVIO" column.
function prevByIndex(logs: ExerciseLog[], defaultValue: number): Map<number, { value: number; rpe: number }> {
  const map = new Map<number, { value: number; rpe: number }>();
  logs.forEach(log => {
    const idx = parseSetIdx(log);
    // Skip uncompleted warmup placeholders (completed_at NULL) — no real values to show.
    if (Number.isInteger(idx) && idx >= 0 && log.completed_at != null) {
      map.set(idx, { value: log.reps_done ?? defaultValue, rpe: log.rpe ?? DEFAULT_RPE });
    }
  });
  return map;
}

function maxLoggedIdx(logs: ExerciseLog[]): number {
  return logs.reduce((m, log) => {
    const idx = parseSetIdx(log);
    return Number.isInteger(idx) && idx > m ? idx : m;
  }, -1);
}

// Resume today's session: rebuild rows (incl. type, values) from today's saved logs.
// Length covers both the prescribed count and any extra/sparse logged indices.
function logsToSets(logs: ExerciseLog[], count: number, defaultValue: number): SetRow[] {
  const length = Math.max(count, maxLoggedIdx(logs) + 1);
  const base = initSets(length, defaultValue);
  logs.forEach(log => {
    const idx = parseSetIdx(log);
    if (Number.isInteger(idx) && idx >= 0 && idx < base.length) {
      base[idx] = {
        uid: base[idx].uid,
        type: log.set_type === "warmup" ? "warmup" : "normal",
        rpe: log.rpe ?? DEFAULT_RPE,
        value: log.reps_done ?? defaultValue,
        painDuring: log.pain_during ?? 0,
        // completed_at NULL = an uncompleted warmup placeholder (type kept, not done).
        completed: log.completed_at != null,
        expanded: false,
      };
    }
  });
  return base;
}

// Use the last session as a template: same number of rows and same warmup positions,
// but unchecked and at default values — the PREVIO ghost (prevByIndex) brings the
// numbers in when tapped. Falls back to the prescribed count if last session is empty.
function templateFromLogs(logs: ExerciseLog[], count: number, defaultValue: number): SetRow[] {
  const length = Math.max(count, maxLoggedIdx(logs) + 1);
  const base = initSets(length, defaultValue);
  logs.forEach(log => {
    const idx = parseSetIdx(log);
    if (Number.isInteger(idx) && idx >= 0 && idx < base.length) {
      base[idx].type = log.set_type === "warmup" ? "warmup" : "normal";
    }
  });
  return base;
}

// ── EditableNum ────────────────────────────────────────────────────────────────
function EditableNum({
  value, min, max, completed, onChange, suffix, size = 22,
}: {
  value: number;
  min: number;
  max: number;
  completed: boolean;
  onChange: (v: number) => void;
  suffix?: string;
  size?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setLocal(String(value));
  }, [value, editing]);

  function open() {
    setEditing(true);
  }

  function commit() {
    const n = parseInt(local, 10);
    if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
        <input
          ref={inputRef}
          autoFocus
          type="number"
          inputMode="numeric"
          value={local}
          onChange={e => setLocal(e.target.value)}
          onFocus={e => e.target.select()}
          onBlur={commit}
          onKeyDown={e => e.key === "Enter" && commit()}
          style={{
            width: Math.max(56, size * 2.6),
            background: "rgba(245,240,232,0.10)",
            border: "1.5px solid rgba(245,240,232,0.30)",
            borderRadius: 8,
            color: "var(--bone)",
            fontFamily: "var(--font-mono)",
            fontSize: size - 2,
            fontWeight: 600,
            textAlign: "center",
            padding: "4px 2px",
            outline: "none",
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{ display: "flex", justifyContent: "center", alignItems: "center", cursor: "pointer" }}
      onClick={open}
    >
      <span style={{
        fontFamily: "var(--font-mono)",
        fontWeight: 600,
        fontSize: size,
        color: completed ? "rgba(245,240,232,0.97)" : "rgba(245,240,232,0.55)",
        transition: "color 0.25s",
        display: "flex",
        alignItems: "baseline",
        gap: 2,
      }}>
        {value}
        {suffix && (
          <span style={{ fontSize: Math.round(size * 0.6), fontWeight: 400, opacity: 0.65 }}>{suffix}</span>
        )}
      </span>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export function ExerciseDetailScreen() {
  const { id } = useParams<{ id: string }>();
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
  const [videoOpen, setVideoOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);

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
            : initSets(totalSets, defaultValue),
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

  function newRow(type: SetType): SetRow {
    return { uid: newUid(), type, rpe: DEFAULT_RPE, value: defaultValue, painDuring: 0, completed: false, expanded: false };
  }

  // Working sets append at the end; warmups go to the top (rendered before working sets).
  function addSet() {
    setSets(prev => [...prev, newRow("normal")]);
  }
  function addWarmup() {
    setSets(prev => [newRow("warmup"), ...prev]);
  }
  function removeSet(i: number) {
    setSets(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!user || !exercise || (completedCount === 0 && !hadLogs && !hasWarmup)) return;
    setSaving(true);
    const sessionDate = localToday(user?.timezone);
    const now = Date.now();
    // Cover removed/unchecked rows too: indices that were saved earlier today but no
    // longer exist (sets.length shrank) get soft-deleted so they stop counting.
    const upper = Math.max(sets.length, loadedCount);
    for (let i = 0; i < upper; i++) {
      const id = `${user.id}:${exercise.id}:${sessionDate}:${i}`;
      const row = sets[i];
      if (row && row.completed) {
        await exerciseRepository.saveExerciseLog({
          id,
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
          id,
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
        await exerciseRepository.softDeleteExerciseLog(id);
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

  const canSave = completedCount > 0 || hadLogs || hasWarmup;

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
            {exercise?.video_url && (
              <button
                onClick={() => setVideoOpen(true)}
                aria-label="Ver video"
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 4,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Ico.video s={32} c="var(--bone)" />
              </button>
            )}
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
        {sets.map((row, i) => {
          const isWarmup = row.type === "warmup";
          // Working sets are numbered among themselves; warmups don't consume a number.
          const workingNum = sets.slice(0, i + 1).filter(s => s.type === "normal").length;
          const accent = isWarmup ? "217,119,87" : "138,168,140"; // clay : moss
          return (
          <motion.div
            key={row.uid}
            layout
            exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.2 } }}
            style={{ position: "relative", marginBottom: 10, borderRadius: "var(--r-md)", overflow: "hidden" }}
          >
            {/* Red layer revealed when the card is swiped left → release past threshold deletes */}
            <div style={{
              position: "absolute", inset: 0,
              background: "#B0532F",
              display: "flex", alignItems: "center", justifyContent: "flex-end",
              gap: 8, paddingRight: 22,
              fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--bone)",
            }}>
              <Ico.close s={16} c="var(--bone)" />
              Eliminar
            </div>
            {/* Draggable front. Opaque base hides the red layer until swiped. */}
            <motion.div
              drag="x"
              dragDirectionLock
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              onDragEnd={(_e, info) => { if (info.offset.x < -90) removeSet(i); }}
              style={{ position: "relative", background: "#111E16", borderRadius: "var(--r-md)", cursor: "grab", touchAction: "pan-y" }}
            >
              <div style={{
                borderRadius: "var(--r-md)",
                overflow: "hidden",
                background: row.completed ? `rgba(${accent},0.12)` : "rgba(245,240,232,0.04)",
                border: `1px solid ${row.completed ? `rgba(${accent},0.40)` : "rgba(245,240,232,0.09)"}`,
                transition: "background 0.3s ease, border-color 0.3s ease",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 14,
                  minHeight: 68, padding: "10px 14px",
                }}>
              {/* Check circle — same language as ExerciseRow on the light list */}
              <motion.button
                onClick={() => toggleCompleted(i)}
                whileTap={{ scale: 0.88 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                aria-label={isWarmup
                  ? (row.completed ? "Calentamiento completado" : "Marcar calentamiento")
                  : (row.completed ? `Serie ${workingNum} completada` : `Marcar serie ${workingNum}`)}
                style={{
                  width: 42, height: 42, borderRadius: 999, flexShrink: 0,
                  background: row.completed ? (isWarmup ? "var(--clay)" : "var(--moss)") : "transparent",
                  border: row.completed ? "none" : "1.5px dashed rgba(245,240,232,0.30)",
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 0.2s ease, border-color 0.2s ease",
                }}
              >
                {row.completed && (
                  <svg width="17" height="13" viewBox="0 0 16 12" fill="none">
                    <path d="M1 6L5.5 10.5L15 1.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </motion.button>

              {/* Set label + previous-session ghost chip (tap copies value+RPE) */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 0, alignItems: "flex-start", paddingRight: 6 }}>
                {isWarmup ? (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em",
                    color: row.completed ? "rgba(245,240,232,0.92)" : "rgba(245,240,232,0.60)",
                    textTransform: "uppercase", transition: "color 0.25s",
                  }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 18, height: 18, borderRadius: 5, fontSize: 11, fontWeight: 700,
                      letterSpacing: 0,
                      color: "var(--clay)",
                      background: "rgba(217,119,87,0.16)",
                      border: "1px solid rgba(217,119,87,0.40)",
                    }}>W</span>
                    Calent.
                  </span>
                ) : (
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em",
                    color: row.completed ? "rgba(245,240,232,0.92)" : "rgba(245,240,232,0.60)",
                    textTransform: "uppercase", transition: "color 0.25s",
                  }}>
                    Serie {workingNum}
                  </span>
                )}
                {(() => {
                  const p = prev.get(i);
                  if (!p) return null;
                  return (
                    <motion.button
                      type="button"
                      onClick={() => { updateSet(i, "value", p.value); updateSet(i, "rpe", p.rpe); }}
                      whileTap={{ scale: 0.9 }}
                      title="Copiar de la última vez"
                      aria-label={`Última vez: ${p.value}${isTimeBased ? " segundos" : " reps"}, RPE ${p.rpe}. Copiar.`}
                      style={{
                        display: "inline-flex", alignItems: "baseline", gap: 4,
                        fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1,
                        padding: "4px 8px",
                        borderRadius: 999,
                        border: "none",
                        background: "rgba(245,240,232,0.06)",
                        color: "rgba(245,240,232,0.60)",
                        cursor: "pointer",
                      }}
                    >
                      <ClockCounterClockwise size={13} weight="bold" style={{ opacity: 0.55, alignSelf: "center" }} />
                      <span style={{ fontWeight: 600 }}>{p.value}{isTimeBased ? "s" : "×"}</span>
                      <span style={{ opacity: 0.5, fontSize: 10 }}>@{p.rpe}</span>
                    </motion.button>
                  );
                })()}
              </div>

              {/* Metrics — fixed-width columns so numbers line up across every set */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 46 }}>
                  <EditableNum
                    value={row.value}
                    min={1}
                    max={isTimeBased ? 300 : 200}
                    completed={row.completed}
                    onChange={v => updateSet(i, "value", v)}
                    suffix={isTimeBased ? "s" : "×"}
                    size={26}
                  />
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em",
                    color: "rgba(245,240,232,0.40)",
                  }}>
                    {isTimeBased ? "TIEMPO" : "REPS"}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 28 }}>
                  <EditableNum
                    value={row.rpe} min={1} max={10}
                    completed={row.completed}
                    onChange={v => updateSet(i, "rpe", v)}
                    size={18}
                  />
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em",
                    color: "rgba(245,240,232,0.40)",
                  }}>
                    RPE
                  </span>
                </div>
              </div>

              {/* Expand caret — opens panel (pain + copy-to-following) */}
              <button
                onClick={() => toggleExpand(i)}
                aria-label="Más opciones"
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 30, height: 30, borderRadius: 8, position: "relative", flexShrink: 0,
                }}
              >
                {!row.expanded && row.painDuring > 0 && (
                  <span style={{
                    position: "absolute", top: 3, right: 3,
                    width: 6, height: 6, borderRadius: 999,
                    background: row.painDuring <= 4 ? "#C9C96E" : "#C96E6E",
                  }} />
                )}
                <span style={{
                  display: "flex", alignItems: "center",
                  transform: row.expanded ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 0.18s ease",
                }}>
                  <Ico.chevR s={15} c="rgba(245,240,232,0.55)" />
                </span>
              </button>
            </div>

            {/* Pain panel */}
            <AnimatePresence>
              {row.expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  style={{ overflow: "hidden" }}
                >
                  <div style={{
                    padding: "14px 16px 18px",
                    borderTop: "1px solid rgba(245,240,232,0.08)",
                    background: "rgba(17,30,22,0.35)",
                  }}>
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      marginBottom: 12,
                    }}>
                      <span style={{
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        letterSpacing: "0.12em",
                        color: "rgba(245,240,232,0.60)",
                      }}>
                        DOLOR
                      </span>
                      <span style={{
                        fontSize: 12,
                        fontFamily: "var(--font-mono)",
                        color: row.painDuring === 0
                          ? "#6EC96E"
                          : row.painDuring <= 4
                          ? "#C9C96E"
                          : "#C96E6E",
                        transition: "color 0.2s",
                      }}>
                        {PAIN_LABELS[Math.round(row.painDuring)]}
                      </span>
                    </div>
                    <input
                      type="range"
                      className="zone-slider"
                      min={0} max={10} step={1}
                      value={row.painDuring}
                      onChange={e => updateSet(i, "painDuring", Number(e.target.value))}
                      style={{
                        "--zone-color": row.painDuring === 0 ? "#6EC96E" : row.painDuring <= 4 ? "#C9C96E" : "#C96E6E",
                      } as React.CSSProperties}
                    />
                    <div style={{
                      display: "flex", justifyContent: "space-between",
                      fontSize: 9,
                      color: "rgba(245,240,232,0.45)",
                      fontFamily: "var(--font-mono)",
                      letterSpacing: "0.08em",
                      marginTop: 4,
                    }}>
                      <span>0</span><span>5</span><span>10</span>
                    </div>

                    {/* Copy all values (incl. pain) to every following set */}
                    {i < sets.length - 1 && (
                      <motion.button
                        type="button"
                        onClick={() => copyToFollowing(i)}
                        whileTap={{ scale: 0.97 }}
                        aria-label={`Copiar valores de la serie ${i + 1} a las siguientes`}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                          width: "100%", marginTop: 18,
                          padding: "11px 14px",
                          borderRadius: 10,
                          border: "1px solid rgba(245,240,232,0.12)",
                          background: "rgba(245,240,232,0.05)",
                          color: "rgba(245,240,232,0.78)",
                          fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          cursor: "pointer",
                        }}
                      >
                        <ArrowLineDown size={16} weight="bold" />
                        Copiar a las series siguientes
                      </motion.button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
          );
        })}
        </AnimatePresence>
        )}

        {/* Add set / warmup */}
        {exercise && (
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button
              type="button"
              onClick={addSet}
              style={{
                flex: 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                padding: "12px 14px",
                borderRadius: "var(--r-md)",
                border: "1px dashed rgba(245,240,232,0.22)",
                background: "rgba(245,240,232,0.03)",
                color: "rgba(245,240,232,0.80)",
                fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              <Ico.plus s={15} c="rgba(245,240,232,0.80)" />
              Serie
            </button>
            <button
              type="button"
              onClick={addWarmup}
              style={{
                flex: 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                padding: "12px 14px",
                borderRadius: "var(--r-md)",
                border: "1px dashed rgba(217,119,87,0.40)",
                background: "rgba(217,119,87,0.06)",
                color: "var(--clay)",
                fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              <Ico.plus s={15} c="var(--clay)" />
              Calentamiento
            </button>
          </div>
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
              onClick={() => {
                const currentIndex = exerciseIds.indexOf(id!);
                const nextId = exerciseIds[currentIndex + 1];
                if (nextId) {
                  navigate(`/today/exercise/${nextId}`, { state: { exerciseIds }, replace: true });
                }
              }}
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

      {/* Video sheet */}
      {videoOpen && !!exercise?.video_url && (
        <BottomSheet variant="dark" onClose={() => setVideoOpen(false)}>
          {(close) => (
            <>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 20px", flexShrink: 0,
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
                padding: "0 20px 20px",
                paddingBottom: "calc(20px + env(safe-area-inset-bottom, 20px))",
              }}>
                <VideoEmbed url={exercise.video_url!} />
              </div>
            </>
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
