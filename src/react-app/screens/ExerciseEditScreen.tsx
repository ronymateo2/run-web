import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDb } from "../hooks/useDb";
import { useSync } from "../hooks/useSync";
import { Ico } from "../components/icons";
import { BackButton } from "../components/BackButton";
import { ScreenNav } from "../components/ScreenNav";
import { getExerciseById, saveExercise, type Exercise } from "../../db/queries/exercises";

type Measure = "reps" | "time";

const TYPE_OPTIONS: { value: Exercise["exercise_type"]; label: string }[] = [
  { value: "isometric", label: "Isométrico" },
  { value: "strength", label: "Fuerza" },
  { value: "mobility", label: "Movilidad" },
  { value: "cardio", label: "Cardio" },
];

export function ExerciseEditScreen() {
  const { id } = useParams<{ id: string }>();
  const db = useDb();
  const push = useSync();
  const navigate = useNavigate();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [measure, setMeasure] = useState<Measure>("reps");
  const [sets, setSets] = useState("3");
  const [value, setValue] = useState("10");
  const [type, setType] = useState<Exercise["exercise_type"]>("mobility");
  const [videoUrl, setVideoUrl] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!db || !id) return;
    const ex = await getExerciseById(db, id);
    if (!ex) return;
    setExercise(ex);
    // Time-based when duration_s is set and reps isn't (matches ExerciseDetailScreen).
    const isTime = !!ex.duration_s && !ex.reps;
    setMeasure(isTime ? "time" : "reps");
    setSets(String(ex.sets ?? 3));
    setValue(String(isTime ? (ex.duration_s ?? 30) : (ex.reps ?? 10)));
    setType(ex.exercise_type);
    setVideoUrl(ex.video_url ?? "");
    setLoaded(true);
  }, [db, id]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!db || !exercise) return;
    setSaving(true);
    const n = Number(value) || 0;
    await saveExercise(db, {
      id: exercise.id,
      phase_id: exercise.phase_id,
      name: exercise.name,
      detail: exercise.detail,
      sets: Number(sets) || null,
      reps: measure === "reps" ? n : null,
      duration_s: measure === "time" ? n : null,
      exercise_type: type,
      sort_order: exercise.sort_order ?? 0,
      video_url: videoUrl.trim() || null,
    });
    push();
    navigate(-1);
  }

  if (!loaded) return (
    <div className="screen">
      <div className="screen-body" style={{ paddingTop: 32 }}><span className="body-sm">Cargando…</span></div>
    </div>
  );

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "12px 14px", borderRadius: 12,
    border: "1px solid var(--line-2)", background: "var(--card)",
    fontFamily: "inherit", fontSize: 15, color: "var(--ink)",
  };

  const segBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
    border: "1px solid var(--line-2)",
    background: active ? "var(--ink)" : "transparent",
    color: active ? "var(--bone)" : "var(--ink)",
    fontFamily: "inherit", fontSize: 14, fontWeight: 600,
  });

  return (
    <div className="screen">
      <ScreenNav back={<BackButton fallbackPath={`/today/exercise/${id}`} color="var(--ink)" />}>
        <div className="eyebrow">Editar</div>
        <div style={{ width: 34 }} />
      </ScreenNav>
      <div className="screen-body" style={{ paddingBottom: 120 }}>

        <div className="title-lg serif mt-16">{exercise?.name}</div>

        <div className="card mt-20 col gap-12" style={{ padding: 18 }}>
          {/* Measure toggle */}
          <div className="col gap-4">
            <span className="eyebrow">Medida</span>
            <div className="row gap-8">
              <button style={segBtn(measure === "reps")} onClick={() => setMeasure("reps")}>Reps</button>
              <button style={segBtn(measure === "time")} onClick={() => setMeasure("time")}>Tiempo</button>
            </div>
          </div>

          <div className="row gap-12">
            <div className="col gap-4" style={{ flex: 1 }}>
              <span className="eyebrow">Series</span>
              <input style={inputStyle} type="number" inputMode="numeric" value={sets} onChange={e => setSets(e.target.value)} />
            </div>
            <div className="col gap-4" style={{ flex: 1 }}>
              <span className="eyebrow">{measure === "time" ? "Segundos" : "Reps"}</span>
              <input style={inputStyle} type="number" inputMode="numeric" value={value} onChange={e => setValue(e.target.value)} />
            </div>
          </div>

          <div className="col gap-4">
            <span className="eyebrow">Tipo</span>
            <select style={inputStyle} value={type} onChange={e => setType(e.target.value as Exercise["exercise_type"])}>
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="col gap-4">
            <span className="eyebrow">Video (URL YouTube)</span>
            <input style={inputStyle} type="url" inputMode="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://youtu.be/…" />
          </div>
        </div>

        <div style={{ marginTop: 28 }}>
          <button className="btn-pill" onClick={handleSave} disabled={saving} style={{ opacity: saving ? 0.6 : 1 }}>
            Guardar <Ico.check s={16} c="#EDE6D6" />
          </button>
        </div>
      </div>
    </div>
  );
}
