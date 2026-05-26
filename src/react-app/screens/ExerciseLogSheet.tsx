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

interface SetData {
  value: number;
  rpe: number;
  pain: number;
}

function Stepper({ value, min = 0, max = 999, unit, onChange, compact = false }: {
  value: number; min?: number; max?: number; unit?: string; compact?: boolean;
  onChange: (v: number) => void;
}) {
  const btnSize = compact ? 26 : 28;
  const fontSize = compact ? 16 : 18;
  const numWidth = compact ? 28 : 36;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        style={{
          width: btnSize, height: btnSize, borderRadius: 7, border: "1.5px solid var(--line-2)",
          background: "transparent", color: "var(--ink)", fontSize, lineHeight: 1,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >−</button>
      <div style={{ textAlign: "center", minWidth: numWidth }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 2 }}>{unit}</span>
        )}
      </div>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        style={{
          width: btnSize, height: btnSize, borderRadius: 7, border: "1.5px solid var(--line-2)",
          background: "transparent", color: "var(--ink)", fontSize, lineHeight: 1,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >+</button>
    </div>
  );
}

export function ExerciseLogSheet({ exerciseId, exerciseName, sets, plannedReps, plannedDurationS, sessionDate, onSave, onClose }: Props) {
  const { user } = useAuth();
  const db = useDb();
  const push = useSync();
  const isTimeBased = !!plannedDurationS && !plannedReps;
  const defaultValue = isTimeBased ? (plannedDurationS ?? 30) : (plannedReps ?? 10);
  const unit = isTimeBased ? "s" : "reps";

  const [setsData, setSetsData] = useState<SetData[]>(
    Array.from({ length: sets }, () => ({ value: defaultValue, rpe: 6, pain: 0 }))
  );

  function update(index: number, patch: Partial<SetData>) {
    setSetsData(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s));
  }

  async function handleSave() {
    if (!db || !user) return;
    const now = Date.now();
    for (let i = 0; i < setsData.length; i++) {
      const s = setsData[i];
      await saveExerciseLog(db, {
        id: crypto.randomUUID(),
        user_id: user.id,
        exercise_id: exerciseId,
        session_date: sessionDate,
        reps_done: s.value,
        pain_during: s.pain,
        rpe: s.rpe,
        completed_at: now + i,
      });
    }
    push();
    onSave();
  }

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
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 999, background: "var(--line-2)", margin: "0 auto 16px" }} />

        {/* Header */}
        <div className="row between" style={{ alignItems: "flex-start", marginBottom: 4 }}>
          <div>
            <div className="eyebrow">{exerciseName}</div>
            <div className="body-sm" style={{ color: "var(--muted)", marginTop: 2 }}>
              {sets} series · objetivo {defaultValue} {unit}
            </div>
          </div>
        </div>

        {/* Column labels */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "30px 1fr auto auto",
          gap: 6, alignItems: "center",
          padding: "10px 0 8px",
          borderBottom: "1px solid var(--line-2)",
          marginBottom: 4,
        }}>
          <span />
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
            {isTimeBased ? "Tiempo" : "Reps"}
          </span>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
            Esfuerzo
          </span>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
            Dolor
          </span>
        </div>

        {/* Scrollable set rows */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {setsData.map((s, i) => (
            <div key={i} style={{
              display: "grid",
              gridTemplateColumns: "36px 1fr 1fr auto",
              gap: 8, alignItems: "center",
              padding: "10px 0",
              borderBottom: i < sets - 1 ? "1px solid var(--line-2)" : "none",
            }}>
              {/* Label */}
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)", fontWeight: 600,
              }}>S{i + 1}</span>

              {/* Value stepper */}
              <Stepper
                value={s.value}
                min={1}
                max={isTimeBased ? 600 : 99}
                unit={unit}
                onChange={v => update(i, { value: v })}
              />

              {/* RPE compact */}
              <div style={{ display: "flex", gap: 3 }}>
                {[4, 5, 6, 7, 8].map(r => (
                  <button
                    key={r}
                    onClick={() => update(i, { rpe: r })}
                    title={r === 4 ? "fácil" : r === 5 ? "moderado" : r === 6 ? "cómodo pero activo" : r === 7 ? "duro pero hablable" : "muy duro"}
                    style={{
                      width: 24, height: 24, borderRadius: 6, border: "1.5px solid",
                      borderColor: r === s.rpe ? "var(--ink)" : "var(--line-2)",
                      background: r === s.rpe ? "var(--ink)" : "transparent",
                      color: r === s.rpe ? "var(--bone)" : "var(--ink)",
                      fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >{r}</button>
                ))}
              </div>

              {/* Pain stepper */}
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <button
                  onClick={() => update(i, { pain: Math.max(0, s.pain - 1) })}
                  style={{
                    width: 24, height: 24, borderRadius: 6, border: "1.5px solid var(--line-2)",
                    background: "transparent", color: "var(--ink)", fontSize: 16, lineHeight: 1,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}
                >−</button>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 600, color: "var(--ink)", minWidth: 20, textAlign: "center" }}>
                  {s.pain}
                </span>
                <button
                  onClick={() => update(i, { pain: Math.min(10, s.pain + 1) })}
                  style={{
                    width: 24, height: 24, borderRadius: 6, border: "1.5px solid var(--line-2)",
                    background: "transparent", color: "var(--ink)", fontSize: 16, lineHeight: 1,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}
                >+</button>
              </div>
            </div>
          ))}
        </div>

        {/* Save */}
        <div style={{ marginTop: 20 }}>
          <button className="btn-pill" onClick={handleSave}>
            Guardar todo <Ico.arrow s={16} c="var(--bone)" />
          </button>
        </div>
      </div>
    </div>
  );
}
