import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useDb } from "../hooks/useDb";
import { useSync } from "../hooks/useSync";
import { Ico } from "../components/icons";
import { saveExerciseLog } from "../../db/queries/exercises";

interface Props {
  exerciseId: string;
  exerciseName: string;
  sets: number;
  plannedReps?: number;
  plannedDurationS?: number;
  sessionDate: string;
  mode: "edit" | "done";
  onSave: () => void;
  onClose: () => void;
}

interface SetEntry {
  filled: boolean;
  value: number;
  rpe: number;
  pain: number;
}

type RpeBucket = "facil" | "comodo" | "duro";

function rpeBucket(rpe: number): RpeBucket {
  if (rpe <= 5) return "facil";
  if (rpe <= 7) return "comodo";
  return "duro";
}

function bucketToRpe(b: RpeBucket, current: number): number {
  if (b === "facil") return current >= 4 && current <= 5 ? current : 5;
  if (b === "comodo") return current >= 6 && current <= 7 ? current : 6;
  return current >= 8 ? current : 8;
}

const BUCKET_LABELS: Record<RpeBucket, { label: string; range: string }> = {
  facil:  { label: "Fácil",    range: "4–5" },
  comodo: { label: "Cómodo",   range: "6–7" },
  duro:   { label: "Difícil",  range: "8+"  },
};

function EsfuerzoBuckets({ rpe, onChange }: { rpe: number; onChange: (v: number) => void }) {
  const current = rpeBucket(rpe);
  const buckets: RpeBucket[] = ["facil", "comodo", "duro"];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
      {buckets.map(b => {
        const active = current === b;
        return (
          <button
            key={b}
            onClick={() => onChange(bucketToRpe(b, rpe))}
            style={{
              padding: "10px 4px",
              borderRadius: 10,
              border: `1.5px solid ${active ? "var(--ink)" : "var(--line-2)"}`,
              background: active ? "var(--ink)" : "transparent",
              color: active ? "var(--bone)" : "var(--ink)",
              cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600 }}>{BUCKET_LABELS[b].label}</span>
            <span style={{ fontSize: 10, opacity: 0.6, fontFamily: "var(--font-mono)" }}>{BUCKET_LABELS[b].range}</span>
          </button>
        );
      })}
    </div>
  );
}

function BigStepper({ value, min = 0, max = 999, unit, onChange }: {
  value: number; min?: number; max?: number; unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        style={{
          width: 48, height: 48, borderRadius: 12,
          border: "1.5px solid var(--line-2)", background: "transparent",
          color: "var(--ink)", fontSize: 22, lineHeight: 1,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >−</button>
      <div style={{ textAlign: "center", minWidth: 72 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 32, fontWeight: 700, color: "var(--ink)" }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 14, color: "var(--muted)", marginLeft: 4 }}>{unit}</span>
        )}
      </div>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        style={{
          width: 48, height: 48, borderRadius: 12,
          border: "1.5px solid var(--line-2)", background: "transparent",
          color: "var(--ink)", fontSize: 22, lineHeight: 1,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >+</button>
    </div>
  );
}

function PainBar({ value }: { value: number }) {
  const label = value === 0 ? "sin dolor" : value <= 3 ? "leve" : value <= 6 ? "molesto" : "agudo";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ height: 6, borderRadius: 999, background: "var(--line-2)", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${(value / 10) * 100}%`,
          borderRadius: 999,
          background: value === 0 ? "var(--moss)" : value <= 3 ? "var(--sun)" : "var(--clay)",
          transition: "width 0.15s ease",
        }} />
      </div>
      <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
        {value}/10 · {label}
      </span>
    </div>
  );
}

export function ExerciseLogSheet({
  exerciseId, exerciseName, sets, plannedReps, plannedDurationS, sessionDate, mode, onSave, onClose,
}: Props) {
  const { user } = useAuth();
  const db = useDb();
  const push = useSync();

  const isTimeBased = !!plannedDurationS && !plannedReps;
  const defaultValue = isTimeBased ? (plannedDurationS ?? 30) : (plannedReps ?? 10);
  const unit = isTimeBased ? "s" : "rep";
  const maxValue = isTimeBased ? 600 : 99;
  const defaultRpe = 6;

  const [entries, setEntries] = useState<SetEntry[]>(
    Array.from({ length: sets }, () => ({ filled: false, value: defaultValue, rpe: defaultRpe, pain: 0 }))
  );

  // Detail view state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingEntry, setEditingEntry] = useState<SetEntry | null>(null);
  const [applyRest, setApplyRest] = useState(false);

  // Completion state (after manual save in edit mode)
  const [done, setDone] = useState(false);
  const [savedEntries, setSavedEntries] = useState<{ value: number; rpe: number; pain: number }[]>([]);

  const showDone = mode === "done" || done;

  const completionEntries = mode === "done"
    ? Array.from({ length: sets }, () => ({ value: defaultValue, rpe: defaultRpe, pain: 0 }))
    : savedEntries;

  const filledCount = entries.filter(e => e.filled).length;
  const remainingCount = editingIndex !== null ? sets - editingIndex - 1 : 0;

  const rpeLabel = BUCKET_LABELS[rpeBucket(defaultRpe)].label;

  function openDetail(index: number) {
    setEditingIndex(index);
    setEditingEntry({ ...entries[index] });
    setApplyRest(false);
  }

  function handleBack() {
    setEditingIndex(null);
    setEditingEntry(null);
    setApplyRest(false);
  }

  function handleListo() {
    if (editingIndex === null || editingEntry === null) return;
    const idx = editingIndex;
    const entry = { ...editingEntry, filled: true };
    setEntries(prev => prev.map((e, i) => {
      if (i === idx) return entry;
      if (applyRest && i > idx) return entry;
      return e;
    }));
    setEditingIndex(null);
    setEditingEntry(null);
    setApplyRest(false);
  }

  function handleMarkIncomplete() {
    if (editingIndex === null) return;
    setEntries(prev => prev.map((e, i) => i === editingIndex ? { ...e, filled: false } : e));
    setEditingIndex(null);
    setEditingEntry(null);
    setApplyRest(false);
  }

  async function handleSave() {
    if (!db || !user) return;
    const toSave = entries.filter(e => e.filled);
    const now = Date.now();
    for (let i = 0; i < toSave.length; i++) {
      const e = toSave[i];
      await saveExerciseLog(db, {
        id: crypto.randomUUID(),
        user_id: user.id,
        exercise_id: exerciseId,
        session_date: sessionDate,
        reps_done: e.value,
        pain_during: e.pain,
        rpe: e.rpe,
        completed_at: now + i,
      });
    }
    push();
    setSavedEntries(toSave.map(e => ({ value: e.value, rpe: e.rpe, pain: e.pain })));
    setDone(true);
  }

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 200,
      display: "flex", flexDirection: "column", justifyContent: "flex-end",
    }}>
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }}
        onClick={showDone ? onSave : onClose}
      />

      <div style={{
        position: "relative", background: "var(--bg)", borderRadius: "24px 24px 0 0",
        padding: "20px 16px 40px", zIndex: 1,
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        paddingBottom: "max(40px, var(--sab, 0px) + 24px)",
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 999, background: "var(--line-2)", margin: "0 auto 16px" }} />

        {/* === COMPLETION VIEW === */}
        {showDone && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink)" }}>
                {completionEntries.length} series × {defaultValue}{unit}
              </div>
              <button
                onClick={onSave}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--ink-3)", fontSize: 22, lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div style={{
              background: "var(--card-soft)", borderRadius: 14, padding: "0 14px",
              overflowY: "auto", flex: 1,
            }}>
              {completionEntries.map((e, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "13px 0",
                  borderBottom: i < completionEntries.length - 1 ? "1px solid var(--line-2)" : "none",
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 999,
                    background: "var(--ink)", color: "var(--bone)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700,
                    flexShrink: 0,
                  }}>{i + 1}</div>

                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
                      {e.value}{unit}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>
                      · {BUCKET_LABELS[rpeBucket(e.rpe)].label}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>
                      · {e.pain}/10
                    </span>
                  </div>

                  <div style={{
                    width: 28, height: 28, borderRadius: 999,
                    background: "var(--ink)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Ico.check s={12} c="var(--bone)" />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ textAlign: "center", padding: "20px 0 4px" }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                ¡Todo registrado!
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                {completionEntries.length} de {sets} series
              </div>
            </div>
          </div>
        )}

        {/* === DETAIL VIEW (editing a single set) === */}
        {!showDone && editingIndex !== null && editingEntry !== null && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <button
                onClick={handleBack}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 0", color: "var(--ink)", fontSize: 15, fontWeight: 500 }}
              >
                ‹ Atrás
              </button>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>
                Editar serie {editingIndex + 1}
              </span>
              <button
                onClick={handleListo}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 0", color: "var(--ink)", fontSize: 15, fontWeight: 600 }}
              >
                Listo
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Value stepper */}
              <div>
                <div className="eyebrow" style={{ marginBottom: 10, fontSize: 10 }}>
                  {isTimeBased ? "TIEMPO" : "REPS"}
                </div>
                <BigStepper
                  value={editingEntry.value}
                  min={1}
                  max={maxValue}
                  unit={unit}
                  onChange={v => setEditingEntry(prev => prev ? { ...prev, value: v } : prev)}
                />
              </div>

              {/* RPE */}
              <div>
                <div className="eyebrow" style={{ marginBottom: 10, fontSize: 10 }}>ESFUERZO (RPE)</div>
                <EsfuerzoBuckets
                  rpe={editingEntry.rpe}
                  onChange={v => setEditingEntry(prev => prev ? { ...prev, rpe: v } : prev)}
                />
              </div>

              {/* Pain */}
              <div>
                <div className="eyebrow" style={{ marginBottom: 10, fontSize: 10 }}>DOLOR</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    onClick={() => setEditingEntry(prev => prev ? { ...prev, pain: Math.max(0, prev.pain - 1) } : prev)}
                    style={{
                      width: 48, height: 48, borderRadius: 12,
                      border: "1.5px solid var(--line-2)", background: "transparent",
                      color: "var(--ink)", fontSize: 22, lineHeight: 1,
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >−</button>
                  <div style={{ flex: 1 }}>
                    <PainBar value={editingEntry.pain} />
                  </div>
                  <button
                    onClick={() => setEditingEntry(prev => prev ? { ...prev, pain: Math.min(10, prev.pain + 1) } : prev)}
                    style={{
                      width: 48, height: 48, borderRadius: 12,
                      border: "1.5px solid var(--line-2)", background: "transparent",
                      color: "var(--ink)", fontSize: 22, lineHeight: 1,
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >+</button>
                </div>
              </div>

              {/* Apply to rest */}
              {remainingCount > 0 && (
                <div>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "4px 0",
                  }}>
                    <span style={{ fontSize: 14, color: "var(--ink)" }}>
                      Aplicar a las restantes ({remainingCount} serie{remainingCount !== 1 ? "s" : ""})
                    </span>
                    <button
                      onClick={() => setApplyRest(r => !r)}
                      style={{
                        width: 44, height: 26, borderRadius: 13,
                        background: applyRest ? "var(--ink)" : "var(--line-2)",
                        border: "none", cursor: "pointer", position: "relative", flexShrink: 0,
                      }}
                    >
                      <div style={{
                        width: 20, height: 20, borderRadius: 10,
                        background: "white",
                        position: "absolute",
                        top: 3,
                        left: applyRest ? 21 : 3,
                        transition: "left 0.15s ease",
                      }} />
                    </button>
                  </div>
                  {applyRest && (
                    <div style={{
                      background: "var(--card-soft)", borderRadius: 10, padding: "10px 12px",
                      marginTop: 8,
                      fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)",
                    }}>
                      {Array.from({ length: remainingCount }, (_, k) => `S${editingIndex + 2 + k}`).join(" y ")}
                      {" · "}{editingEntry.value}{unit}
                      {" · "}{BUCKET_LABELS[rpeBucket(editingEntry.rpe)].label}
                      {" · "}{editingEntry.pain}/10 dolor
                    </div>
                  )}
                </div>
              )}

              {/* Mark incomplete */}
              <button
                onClick={handleMarkIncomplete}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  padding: "12px 0",
                  fontSize: 13, color: "var(--clay)", textAlign: "center",
                  width: "100%",
                }}
              >
                Marcar como no completada
              </button>
            </div>
          </div>
        )}

        {/* === LIST VIEW === */}
        {!showDone && editingIndex === null && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--muted)", fontFamily: "var(--font-mono)", marginBottom: 2 }}>
                    Registrando...
                  </div>
                  <div style={{
                    fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 400,
                    color: "var(--ink)", lineHeight: 1.2,
                  }}>{exerciseName}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 600, color: "var(--ink)",
                      background: "var(--card-soft)", borderRadius: 6, padding: "2px 8px",
                    }}>{sets} series</span>
                    <span style={{
                      fontSize: 13, fontWeight: 600, color: "var(--ink)",
                      background: "var(--card-soft)", borderRadius: 6, padding: "2px 8px",
                    }}>objetivo {defaultValue}{unit}</span>
                    <span style={{
                      fontSize: 13, fontWeight: 600, color: "var(--ink)",
                      background: "var(--card-soft)", borderRadius: 6, padding: "2px 8px",
                    }}>RPE {rpeLabel}</span>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--ink-3)", fontSize: 22, lineHeight: 1, flexShrink: 0 }}
                >
                  ×
                </button>
              </div>
            </div>

            <div style={{ overflowY: "auto", flex: 1 }}>
              <div style={{ background: "var(--card-soft)", borderRadius: 14, padding: "0 14px" }}>
                {entries.map((entry, i) => {
                  const bucketLabel = BUCKET_LABELS[rpeBucket(entry.rpe)].label;
                  return (
                    <button
                      key={i}
                      onClick={() => openDetail(i)}
                      style={{
                        width: "100%", background: "none", border: "none", cursor: "pointer",
                        padding: "14px 0",
                        display: "flex", alignItems: "center", gap: 10,
                        borderBottom: i < sets - 1 ? "1px solid var(--line-2)" : "none",
                        minHeight: 52,
                      }}
                    >
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
                        color: entry.filled ? "var(--ink)" : "var(--muted)",
                        minWidth: 24,
                      }}>
                        S{i + 1}
                      </span>

                      {entry.filled ? (
                        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            width: 18, height: 18, borderRadius: 999, background: "var(--moss)",
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}>
                            <Ico.check s={10} c="var(--bone)" />
                          </span>
                          <span style={{ fontSize: 14, color: "var(--ink)", fontWeight: 600 }}>
                            {entry.value}{unit}
                          </span>
                          <span style={{ fontSize: 13, color: "var(--muted)" }}>
                            · {bucketLabel}{entry.pain > 0 ? ` · dolor ${entry.pain}/10` : ""}
                          </span>
                        </div>
                      ) : (
                        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 14, color: "var(--ink)", fontWeight: 600, opacity: 0.35 }}>
                            {entry.value}{unit}
                          </span>
                          <span style={{ fontSize: 13, color: "var(--muted)", opacity: 0.6 }}>
                            · {bucketLabel} · sin dolor
                          </span>
                        </div>
                      )}

                      <span style={{ fontSize: 16, color: "var(--muted)", flexShrink: 0 }}>›</span>
                    </button>
                  );
                })}
              </div>

              {filledCount === 0 && (
                <p style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", margin: "12px 0 0" }}>
                  Toca una serie para registrar
                </p>
              )}
            </div>

            <div style={{ marginTop: 16, flexShrink: 0 }}>
              <button
                className="btn-pill"
                onClick={handleSave}
                disabled={filledCount === 0}
                style={{ opacity: filledCount === 0 ? 0.4 : 1 }}
              >
                {filledCount === 0
                  ? "Registrar series"
                  : `Guardar ${filledCount} serie${filledCount > 1 ? "s" : ""}`}
                {filledCount > 0 && <Ico.arrow s={16} c="var(--bone)" />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
