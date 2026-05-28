import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useDb } from "../hooks/useDb";
import { useAuth } from "../auth/AuthContext";
import { useSync } from "../hooks/useSync";
import { localToday } from "../utils/timezone";
import { Ico } from "../components/icons";
import {
  getExerciseById, saveExerciseLog, getLogsForExercise,
  type Exercise, type ExerciseLog,
} from "../../db/queries/exercises";

const DEFAULT_RPE = 6;

const PAIN_LABELS = [
  "Sin dolor", "Muy leve", "Leve", "Leve-mod",
  "Moderado", "Moderado", "Mod-fuerte", "Fuerte",
  "Muy fuerte", "Intenso", "Máximo",
];

type SetRow = {
  rpe: number;
  value: number;
  painDuring: number;
  completed: boolean;
  expanded: boolean;
};

function initSets(count: number, defaultValue: number): SetRow[] {
  return Array.from({ length: count }, () => ({
    rpe: DEFAULT_RPE,
    value: defaultValue,
    painDuring: 0,
    completed: false,
    expanded: false,
  }));
}

function logsToSets(logs: ExerciseLog[], count: number, defaultValue: number): SetRow[] {
  const base = initSets(count, defaultValue);
  logs.forEach((log, i) => {
    if (i < base.length) {
      base[i] = {
        rpe: log.rpe ?? DEFAULT_RPE,
        value: log.reps_done ?? defaultValue,
        painDuring: log.pain_during ?? 0,
        completed: true,
        expanded: false,
      };
    }
  });
  return base;
}

// ── EditableNum ────────────────────────────────────────────────────────────────
function EditableNum({
  value, min, max, completed, onChange, suffix,
}: {
  value: number;
  min: number;
  max: number;
  completed: boolean;
  onChange: (v: number) => void;
  suffix?: string;
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
            width: 56,
            background: "rgba(245,240,232,0.10)",
            border: "1.5px solid rgba(245,240,232,0.30)",
            borderRadius: 8,
            color: "var(--bone)",
            fontFamily: "var(--font-mono)",
            fontSize: 20,
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
        fontSize: 22,
        color: completed ? "rgba(245,240,232,0.97)" : "rgba(245,240,232,0.45)",
        transition: "color 0.25s",
        display: "flex",
        alignItems: "baseline",
        gap: 2,
      }}>
        {value}
        {suffix && (
          <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.65 }}>{suffix}</span>
        )}
      </span>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export function ExerciseDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const db = useDb();
  const { user } = useAuth();
  const navigate = useNavigate();
  const push = useSync();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [saving, setSaving] = useState(false);

  const totalSets = exercise?.sets ?? 3;
  const isTimeBased = !!exercise?.duration_s && !exercise?.reps;
  const defaultValue = isTimeBased ? (exercise?.duration_s ?? 30) : (exercise?.reps ?? 10);
  const completedCount = sets.filter(s => s.completed).length;

  useEffect(() => {
    if (!db || !id) return;
    getExerciseById(db, id).then(e => setExercise(e));
  }, [db, id]);

  useEffect(() => {
    if (!db || !user || !exercise) return;
    const sessionDate = localToday(user?.timezone);
    getLogsForExercise(db, user.id, exercise.id, sessionDate).then(logs => {
      setSets(
        logs.length > 0
          ? logsToSets(logs, totalSets, defaultValue)
          : initSets(totalSets, defaultValue),
      );
    });
  }, [db, user, exercise]);

  function updateSet(i: number, field: "rpe" | "value" | "painDuring", val: number) {
    setSets(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  }

  function toggleCompleted(i: number) {
    setSets(prev => prev.map((s, idx) => idx === i ? { ...s, completed: !s.completed } : s));
  }

  function toggleExpand(i: number) {
    setSets(prev => prev.map((s, idx) => idx === i ? { ...s, expanded: !s.expanded } : s));
  }

  async function handleSave() {
    if (!db || !user || !exercise || completedCount === 0) return;
    setSaving(true);
    const sessionDate = localToday(user?.timezone);
    const now = Date.now();
    for (let i = 0; i < sets.length; i++) {
      if (!sets[i].completed) continue;
      await saveExerciseLog(db, {
        id: `${user.id}:${exercise.id}:${sessionDate}:${i}`,
        user_id: user.id,
        exercise_id: exercise.id,
        session_date: sessionDate,
        reps_done: sets[i].value,
        pain_during: sets[i].painDuring,
        rpe: sets[i].rpe,
        completed_at: now + i,
      });
    }
    push();
    setSaving(false);
    navigate(-1);
  }

  const saveLabel = saving
    ? "Guardando..."
    : completedCount === 0
    ? "Completa al menos una serie"
    : completedCount === totalSets
    ? "Registrar todas las series"
    : `Registrar ${completedCount} de ${totalSets} series`;

  return (
    <div className="screen screen-dark" style={{ position: "relative" }}>
      <div className="screen-body" style={{
        paddingBottom: 120, paddingTop: 24,
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

        {/* Title */}
        <div style={{ textAlign: "center", marginTop: 28, marginBottom: 36 }}>
          <div className="title-xl serif" style={{ color: "var(--bone)", lineHeight: 1.05 }}>
            {exercise?.name ?? "Ejercicio"}
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

        {/* Column headers */}
        {exercise && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "44px 1fr 1fr 52px 40px",
            padding: "0 4px 10px",
            borderBottom: "1px solid rgba(245,240,232,0.10)",
            marginBottom: 0,
          }}>
            {(["SET", "RPE", isTimeBased ? "TIEMPO" : "REPS", "", ""] as string[]).map((h, i) => (
              <div key={i} style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.12em",
                color: "rgba(245,240,232,0.55)",
                textAlign: i === 0 ? "left" : "center",
                paddingLeft: i === 0 ? 8 : 0,
              }}>
                {h}
              </div>
            ))}
          </div>
        )}

        {/* Set rows */}
        {exercise && sets.map((row, i) => (
          <div key={i}>
            {/* Row */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "44px 1fr 1fr 52px 40px",
              alignItems: "center",
              minHeight: 64,
              padding: "6px 4px",
              background: row.completed ? "rgba(110,201,110,0.07)" : "transparent",
              transition: "background 0.3s ease",
              borderBottom: "1px solid rgba(245,240,232,0.07)",
            }}>
              {/* Set number */}
              <div style={{
                fontFamily: "var(--font-mono)",
                fontSize: 22,
                fontWeight: 700,
                color: row.completed ? "rgba(245,240,232,0.95)" : "rgba(245,240,232,0.45)",
                paddingLeft: 8,
                transition: "color 0.25s",
              }}>
                {i + 1}
              </div>

              <EditableNum
                value={row.rpe} min={1} max={10}
                completed={row.completed}
                onChange={v => updateSet(i, "rpe", v)}
              />

              <EditableNum
                value={row.value}
                min={1}
                max={isTimeBased ? 300 : 200}
                completed={row.completed}
                onChange={v => updateSet(i, "value", v)}
                suffix={isTimeBased ? "s" : "×"}
              />

              {/* Check button */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  onClick={() => toggleCompleted(i)}
                  style={{
                    width: 38, height: 38,
                    borderRadius: 10,
                    border: row.completed ? "none" : "1.5px solid rgba(245,240,232,0.22)",
                    background: row.completed ? "#6EC96E" : "transparent",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.2s ease",
                    flexShrink: 0,
                  }}
                >
                  {row.completed && (
                    <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                      <path
                        d="M1 6L5.5 10.5L15 1.5"
                        stroke="white"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </div>

              {/* Expand caret */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  onClick={() => toggleExpand(i)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 32, height: 32,
                  }}
                >
                  <span style={{
                    display: "flex", alignItems: "center",
                    transform: row.expanded ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.18s ease",
                  }}>
                    <Ico.chevR s={15} c="rgba(245,240,232,0.55)" />
                  </span>
                </button>
              </div>
            </div>

            {/* Pain panel */}
            <AnimatePresence>
              {row.expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  style={{
                    overflow: "hidden",
                    borderBottom: "1px solid rgba(245,240,232,0.07)",
                  }}
                >
                  <div style={{
                    padding: "14px 16px 18px",
                    background: "rgba(245,240,232,0.03)",
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
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* Footer */}
      {exercise && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          padding: "20px 24px 40px",
          background: "linear-gradient(to top, #111E16 60%, transparent)",
          pointerEvents: "none",
        }}>
          <motion.button
            className="btn-pill"
            onClick={handleSave}
            disabled={saving || completedCount === 0}
            whileTap={completedCount > 0 && !saving ? { scale: 0.97 } : {}}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            style={{
              opacity: completedCount === 0 ? 0.35 : 1,
              pointerEvents: "auto",
            }}
          >
            {saveLabel}
            {!saving && completedCount > 0 && <Ico.check s={16} c="var(--bone)" />}
          </motion.button>
        </div>
      )}
    </div>
  );
}
