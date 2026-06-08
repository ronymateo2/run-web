import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
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
    if (Number.isInteger(idx) && idx >= 0) {
      map.set(idx, { value: log.reps_done ?? defaultValue, rpe: log.rpe ?? DEFAULT_RPE });
    }
  });
  return map;
}

function logsToSets(logs: ExerciseLog[], count: number, defaultValue: number): SetRow[] {
  const base = initSets(count, defaultValue);
  logs.forEach(log => {
    const idx = parseSetIdx(log);
    if (Number.isInteger(idx) && idx >= 0 && idx < base.length) {
      base[idx] = {
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const push = useSync();
  const exerciseIds: string[] = location.state?.exerciseIds ?? [];

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [nextExercise, setNextExercise] = useState<Exercise | null>(null);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [prev, setPrev] = useState<Map<number, { value: number; rpe: number }>>(new Map());
  const [hadLogs, setHadLogs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);

  const totalSets = exercise?.sets ?? 3;
  const isTimeBased = !!exercise?.duration_s && !exercise?.reps;
  const defaultValue = isTimeBased ? (exercise?.duration_s ?? 30) : (exercise?.reps ?? 10);
  const completedCount = sets.filter(s => s.completed).length;

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
    const sessionDate = localToday(user?.timezone);
    exerciseRepository.getLogsForExercise(user.id, exercise.id, sessionDate).then(logs => {
      setHadLogs(logs.length > 0);
      setSets(
        logs.length > 0
          ? logsToSets(logs, totalSets, defaultValue)
          : initSets(totalSets, defaultValue),
      );
    });
    exerciseRepository.getLastSessionForExercise(user.id, exercise.id, sessionDate).then(last => {
      setPrev(last ? prevByIndex(last.logs, defaultValue) : new Map());
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

  async function handleSave() {
    if (!user || !exercise || (completedCount === 0 && !hadLogs)) return;
    setSaving(true);
    const sessionDate = localToday(user?.timezone);
    const now = Date.now();
    for (let i = 0; i < sets.length; i++) {
      const id = `${user.id}:${exercise.id}:${sessionDate}:${i}`;
      if (sets[i].completed) {
        await exerciseRepository.saveExerciseLog({
          id,
          user_id: user.id,
          exercise_id: exercise.id,
          session_date: sessionDate,
          reps_done: sets[i].value,
          pain_during: sets[i].painDuring,
          rpe: sets[i].rpe,
          completed_at: now + i,
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
    ? hadLogs
      ? "Borrar registro"
      : "Completa al menos una serie"
    : completedCount === totalSets
    ? "Registrar todas las series"
    : `Registrar ${completedCount} de ${totalSets} series`;

  const canSave = completedCount > 0 || hadLogs;

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
        paddingBottom: 120,
        display: "flex", flexDirection: "column", flex: 1,
      }}>

        {/* Title */}
        <div style={{ textAlign: "center", marginTop: 8, marginBottom: 24 }}>
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

        {/* Column headers */}
        {exercise && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "32px 1.05fr 0.85fr 0.85fr 46px 34px",
            padding: "0 4px 10px",
            borderBottom: "1px solid rgba(245,240,232,0.10)",
            marginBottom: 0,
          }}>
            {(["SET", "PREVIO", "RPE", isTimeBased ? "TIEMPO" : "REPS", "", ""] as string[]).map((h, i) => (
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
              gridTemplateColumns: "32px 1.05fr 0.85fr 0.85fr 46px 34px",
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

              {/* Previous session: ghost-chip (tap copies last time's value+RPE to today). */}
              {(() => {
                const p = prev.get(i);
                if (!p) {
                  return (
                    <div style={{
                      display: "flex", justifyContent: "center", alignItems: "center",
                      fontFamily: "var(--font-mono)", fontSize: 13,
                      color: "rgba(245,240,232,0.22)",
                    }}>
                      —
                    </div>
                  );
                }
                return (
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <motion.button
                      type="button"
                      onClick={() => { updateSet(i, "value", p.value); updateSet(i, "rpe", p.rpe); }}
                      whileTap={{ scale: 0.9 }}
                      title="Copiar de la última vez"
                      aria-label={`Última vez: ${p.value}${isTimeBased ? " segundos" : " reps"}, RPE ${p.rpe}. Copiar.`}
                      style={{
                        display: "inline-flex", alignItems: "baseline", gap: 4,
                        fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1,
                        padding: "5px 9px",
                        borderRadius: 999,
                        border: "none",
                        background: "rgba(245,240,232,0.055)",
                        color: "rgba(245,240,232,0.62)",
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>
                        {p.value}{isTimeBased ? "s" : "×"}
                      </span>
                      <span style={{ opacity: 0.3 }}>·</span>
                      <span style={{ opacity: 0.5, fontSize: 11, fontWeight: 400 }}>
                        {p.rpe}
                      </span>
                    </motion.button>
                  </div>
                );
              })()}

              <EditableNum
                value={row.rpe} min={1} max={10}
                completed={row.completed}
                onChange={v => updateSet(i, "rpe", v)}
              />

              {/* Static hold target (duration_s on a reps exercise) lives in the protocol
                  chip above the table, not here — this column is the editable rep count only. */}
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
                justifyContent: "space-between",
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
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.10em",
                color: "rgba(245,240,232,0.55)",
              }}>
                SIGUIENTE
              </span>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span style={{
                  fontSize: 14,
                  fontFamily: "var(--font-body)",
                  color: "var(--bone)",
                  fontWeight: 500,
                }}>
                  {nextExercise.name}
                </span>
                <Ico.chevR s={16} c="var(--bone)" />
              </div>
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
