import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useDb } from "../hooks/useDb";
import { useSync } from "../hooks/useSync";
import { Ico } from "../components/icons";
import { saveExerciseLog } from "../../db/queries/exercises";

interface Props {
  exerciseId: string;
  exerciseName: string;
  plannedReps?: number;
  sessionDate: string;
  onSave: () => void;
  onClose: () => void;
}

const RPE_LABELS: Record<number, string> = {
  4: "fácil", 5: "moderado", 6: "cómodo pero activo",
  7: "duro pero hablable", 8: "muy duro",
};

export function ExerciseLogSheet({ exerciseId, exerciseName, plannedReps = 10, sessionDate, onSave, onClose }: Props) {
  const { user } = useAuth();
  const db = useDb();
  const push = useSync();
  const [reps, setReps] = useState(plannedReps);
  const [pain, setPain] = useState(0);
  const [rpe, setRpe] = useState(6);
  const [note, setNote] = useState("");

  const repOptions = Array.from({ length: 9 }, (_, i) => i + (plannedReps - 3 < 1 ? 1 : plannedReps - 3));

  async function handleSave() {
    if (!db || !user) return;
    await saveExerciseLog(db, {
      id: crypto.randomUUID(),
      user_id: user.id,
      exercise_id: exerciseId,
      session_date: sessionDate,
      reps_done: reps,
      pain_during: pain,
      rpe,
      note: note || undefined,
      completed_at: Date.now(),
    });
    push();
    onSave();
  }

  const painColor = pain >= 5 ? "var(--clay)" : pain >= 3 ? "var(--sun)" : "var(--moss)";

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 200,
      display: "flex", flexDirection: "column", justifyContent: "flex-end",
    }}>
      {/* Backdrop */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={onClose} />

      {/* Sheet */}
      <div style={{
        position: "relative", background: "var(--bg)", borderRadius: "24px 24px 0 0",
        padding: "24px 22px 40px", zIndex: 1,
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 999, background: "var(--line-2)", margin: "0 auto 20px" }} />

        <div className="eyebrow">Registrar serie · {exerciseName}</div>

        {/* Reps */}
        <div className="col gap-8 mt-16">
          <div className="body" style={{ fontWeight: 600 }}>Repeticiones hechas</div>
          <div className="row gap-8" style={{ flexWrap: "wrap" }}>
            {repOptions.map(r => (
              <button
                key={r}
                onClick={() => setReps(r)}
                style={{
                  width: 44, height: 44, borderRadius: 999, border: "1.5px solid",
                  borderColor: r === reps ? "var(--ink)" : "var(--line-2)",
                  background: r === reps ? "var(--ink)" : "transparent",
                  color: r === reps ? "var(--bone)" : "var(--ink)",
                  fontFamily: "var(--font-mono)", fontSize: 15, cursor: "pointer",
                }}
              >
                {r}{r === plannedReps && <sup style={{ fontSize: 8 }}>✓</sup>}
              </button>
            ))}
          </div>
        </div>

        {/* Pain during */}
        <div className="col gap-8 mt-20">
          <div className="row between">
            <div className="body" style={{ fontWeight: 600 }}>Dolor durante el aprieto</div>
            <div className="num" style={{ fontSize: 28, color: painColor, fontFamily: "var(--font-serif)" }}>{pain}</div>
          </div>
          <div style={{ position: "relative", height: 40, display: "flex", alignItems: "center" }}>
            <div style={{
              position: "absolute", left: 0, right: 0, height: 6, borderRadius: 999,
              background: `linear-gradient(to right, var(--moss), var(--sun), var(--clay))`,
            }} />
            <input
              type="range" min={0} max={10} value={pain}
              onChange={e => setPain(Number(e.target.value))}
              style={{ width: "100%", position: "relative", accentColor: painColor, zIndex: 1 }}
            />
          </div>
          <div className="row between">
            <span className="body-sm">sin dolor</span>
            <span className="body-sm">máximo</span>
          </div>
        </div>

        {/* RPE */}
        <div className="col gap-8 mt-20">
          <div className="body" style={{ fontWeight: 600 }}>Esfuerzo percibido</div>
          <div className="row gap-8">
            {[4, 5, 6, 7, 8].map(r => (
              <button
                key={r}
                onClick={() => setRpe(r)}
                style={{
                  flex: 1, padding: "10px 4px", borderRadius: 12, border: "1.5px solid",
                  borderColor: r === rpe ? "var(--ink)" : "var(--line-2)",
                  background: r === rpe ? "var(--ink)" : "transparent",
                  color: r === rpe ? "var(--bone)" : "var(--ink)",
                  fontFamily: "var(--font-mono)", fontSize: 15, cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                }}
              >
                <span>{r}</span>
                <span style={{ fontSize: 8, color: r === rpe ? "rgba(237,230,214,0.65)" : "var(--muted)", lineHeight: 1.2, textAlign: "center" }}>
                  {RPE_LABELS[r]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="col gap-6 mt-16">
          <div className="body-sm">Nota (opcional)</div>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="ej. sentí un jalón leve en ingle..."
            style={{
              padding: "12px 14px", borderRadius: 12, border: "1px solid var(--line-2)",
              background: "var(--card-soft)", fontFamily: "var(--font-sans)", fontSize: 14,
              color: "var(--ink)", outline: "none", width: "100%",
            }}
          />
        </div>

        {/* Save */}
        <div style={{ marginTop: 24 }}>
          <button className="btn-pill" onClick={handleSave}>
            Guardar y siguiente <Ico.arrow s={16} c="var(--bone)" />
          </button>
        </div>
      </div>
    </div>
  );
}
