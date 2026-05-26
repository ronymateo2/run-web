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
  facil:  { label: "Fácil",   range: "4–5" },
  comodo: { label: "Cómodo",  range: "6–7" },
  duro:   { label: "Duro",    range: "8+"  },
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

interface SetRowProps {
  index: number;
  entry: SetEntry;
  isExpanded: boolean;
  isTimeBased: boolean;
  unit: string;
  maxValue: number;
  isLast: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<SetEntry>) => void;
  onApplyToRest: () => void;
}

function SetRow({ index, entry, isExpanded, isTimeBased, unit, maxValue, isLast, onToggle, onUpdate, onApplyToRest }: SetRowProps) {
  const [painOpen, setPainOpen] = useState(false);
  const bucketLabel = BUCKET_LABELS[rpeBucket(entry.rpe)].label;

  function handleUpdate(patch: Partial<SetEntry>) {
    onUpdate({ filled: true, ...patch });
  }

  return (
    <div style={{
      borderBottom: isLast ? "none" : "1px solid var(--line-2)",
    }}>
      {/* Collapsed row — tap to expand */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: "14px 0", display: "flex", alignItems: "center", gap: 10,
          minHeight: 52,
        }}
      >
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
          color: entry.filled ? "var(--ink)" : "var(--muted)",
          minWidth: 24,
        }}>
          S{index + 1}
        </span>

        {entry.filled ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              width: 18, height: 18, borderRadius: 999, background: "var(--moss)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Ico.check s={10} c="var(--bone)" />
            </span>
            <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>
              {entry.value}{unit} · {bucketLabel}{entry.pain > 0 ? ` · dolor ${entry.pain}/10` : ""}
            </span>
          </div>
        ) : (
          <span style={{ flex: 1, fontSize: 13, color: "var(--muted)", textAlign: "left" }}>
            pendiente
          </span>
        )}

        <span style={{
          fontSize: 16, color: "var(--muted)",
          transform: isExpanded ? "rotate(90deg)" : "none",
          transition: "transform 0.15s ease",
          flexShrink: 0,
        }}>›</span>
      </button>

      {/* Expanded editor */}
      {isExpanded && (
        <div style={{
          paddingBottom: 16,
          display: "flex", flexDirection: "column", gap: 16,
        }}>
          {/* Value stepper */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 10, fontSize: 10 }}>
              {isTimeBased ? "TIEMPO" : "REPS"}
            </div>
            <BigStepper
              value={entry.value}
              min={1}
              max={maxValue}
              unit={unit}
              onChange={v => handleUpdate({ value: v })}
            />
          </div>

          {/* RPE */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 10, fontSize: 10 }}>ESFUERZO</div>
            <EsfuerzoBuckets
              rpe={entry.rpe}
              onChange={v => handleUpdate({ rpe: v })}
            />
          </div>

          {/* Pain (collapsible) */}
          <div>
            {!painOpen ? (
              <button
                onClick={() => {
                  setPainOpen(true);
                  handleUpdate({});
                }}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: "4px 0",
                  fontSize: 13, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4,
                }}
              >
                <span style={{ fontSize: 16 }}>+</span>
                {entry.pain > 0 ? `dolor: ${entry.pain}/10` : "¿sentiste dolor?"}
              </button>
            ) : (
              <div>
                <div className="eyebrow" style={{ marginBottom: 10, fontSize: 10 }}>DOLOR</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    onClick={() => handleUpdate({ pain: Math.max(0, entry.pain - 1) })}
                    style={{
                      width: 48, height: 48, borderRadius: 12,
                      border: "1.5px solid var(--line-2)", background: "transparent",
                      color: "var(--ink)", fontSize: 22, lineHeight: 1,
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >−</button>
                  <div style={{ flex: 1 }}>
                    <PainBar value={entry.pain} />
                  </div>
                  <button
                    onClick={() => handleUpdate({ pain: Math.min(10, entry.pain + 1) })}
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
            )}
          </div>

          {/* Apply to rest shortcut */}
          <button
            onClick={onApplyToRest}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: "4px 0",
              fontSize: 13, color: "var(--ink-2)", display: "flex", alignItems: "center", gap: 4,
              fontWeight: 500,
            }}
          >
            Aplicar a las restantes →
          </button>
        </div>
      )}
    </div>
  );
}

export function ExerciseLogSheet({ exerciseId, exerciseName, sets, plannedReps, plannedDurationS, sessionDate, onSave, onClose }: Props) {
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
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  function update(index: number, patch: Partial<SetEntry>) {
    setEntries(prev => prev.map((e, i) => i === index ? { ...e, ...patch } : e));
  }

  function applyToRest(fromIndex: number) {
    const source = entries[fromIndex];
    setEntries(prev => prev.map((e, i) => i > fromIndex ? { ...source, filled: true } : e));
  }

  const filledCount = entries.filter(e => e.filled).length;

  async function handleSave(overrideEntries?: SetEntry[]) {
    if (!db || !user) return;
    const toSave = overrideEntries ?? entries.filter(e => e.filled);
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
    onSave();
  }

  function handleAllAsPlanned() {
    const all = entries.map(() => ({ filled: true, value: defaultValue, rpe: defaultRpe, pain: 0 }));
    handleSave(all);
  }

  const rpeLabel = BUCKET_LABELS[rpeBucket(defaultRpe)].label.toLowerCase();

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 200,
      display: "flex", flexDirection: "column", justifyContent: "flex-end",
    }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={onClose} />

      <div style={{
        position: "relative", background: "var(--bg)", borderRadius: "24px 24px 0 0",
        padding: "20px 16px 40px", zIndex: 1,
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        paddingBottom: "max(40px, var(--sab, 0px) + 24px)",
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 999, background: "var(--line-2)", margin: "0 auto 16px" }} />

        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ fontSize: 11 }}>{exerciseName}</div>
          <div className="body-sm" style={{ color: "var(--muted)", marginTop: 2 }}>
            {sets} series · objetivo {defaultValue}{unit} · {rpeLabel}
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Hero: all as planned */}
          <button
            onClick={handleAllAsPlanned}
            style={{
              width: "100%", background: "var(--ink)", border: "none", borderRadius: 14,
              padding: "16px 18px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--bone)", marginBottom: 2 }}>
                Todas como el plan
              </div>
              <div style={{ fontSize: 12, color: "rgba(237,230,214,0.6)", fontFamily: "var(--font-mono)" }}>
                {sets}×{defaultValue}{unit} · {rpeLabel} · sin dolor
              </div>
            </div>
            <div style={{
              width: 32, height: 32, borderRadius: 999,
              background: "rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Ico.check s={16} c="var(--bone)" />
            </div>
          </button>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: "var(--line-2)" }} />
            <span style={{ fontSize: 11, color: "var(--muted)" }}>o ajustar cada serie</span>
            <div style={{ flex: 1, height: 1, background: "var(--line-2)" }} />
          </div>

          {/* Set rows */}
          <div style={{
            background: "var(--card-soft)", borderRadius: 14,
            padding: "0 14px",
            flexShrink: 0,
          }}>
            {entries.map((entry, i) => (
              <SetRow
                key={i}
                index={i}
                entry={entry}
                isExpanded={expandedIndex === i}
                isTimeBased={isTimeBased}
                unit={unit}
                maxValue={maxValue}
                isLast={i === sets - 1}
                onToggle={() => setExpandedIndex(prev => prev === i ? null : i)}
                onUpdate={patch => update(i, patch)}
                onApplyToRest={() => {
                  applyToRest(i);
                  setExpandedIndex(null);
                }}
              />
            ))}
          </div>

          {/* Hint */}
          {filledCount === 0 && (
            <p style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", margin: 0 }}>
              Guarda solo las series que completaste
            </p>
          )}
        </div>

        {/* Save partial */}
        <div style={{ marginTop: 16, flexShrink: 0 }}>
          <button
            className="btn-pill"
            onClick={() => handleSave()}
            disabled={filledCount === 0}
            style={{ opacity: filledCount === 0 ? 0.4 : 1 }}
          >
            {filledCount === 0
              ? "Registrar series"
              : `Guardar ${filledCount} serie${filledCount > 1 ? "s" : ""}`}
            {filledCount > 0 && <Ico.arrow s={16} c="var(--bone)" />}
          </button>
        </div>
      </div>
    </div>
  );
}
