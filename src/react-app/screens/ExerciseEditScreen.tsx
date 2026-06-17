import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSync } from "../hooks/useSync";
import { Ico } from "../components/icons";
import { BackButton } from "../components/BackButton";
import { ScreenNav } from "../components/ScreenNav";
import { exerciseRepository, type Exercise } from "../../data/repositories";
import { normalize } from "../components/VideoEmbed";

type Measure = "reps" | "time";

const TYPE_OPTIONS: { value: Exercise["exercise_type"]; label: string }[] = [
  { value: "isometric", label: "Isométrico" },
  { value: "strength", label: "Fuerza" },
  { value: "mobility", label: "Movilidad" },
  { value: "cardio", label: "Cardio" },
];

const EQUIP_OPTIONS: { value: Exercise["equipment_type"]; label: string }[] = [
  { value: "none", label: "Ninguno" },
  { value: "weight", label: "Pesa (kg)" },
  { value: "band", label: "Banda" },
];

export function ExerciseEditScreen() {
  const { id } = useParams<{ id: string }>();
  const push = useSync();
  const navigate = useNavigate();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [measure, setMeasure] = useState<Measure>("reps");
  const [sets, setSets] = useState("3");
  const [warmup, setWarmup] = useState("0");
  const [value, setValue] = useState("10");
  const [durationOpt, setDurationOpt] = useState("");
  const [type, setType] = useState<Exercise["exercise_type"]>("mobility");
  const [equipment, setEquipment] = useState<Exercise["equipment_type"]>("none");
  const [targetRpe, setTargetRpe] = useState("6");
  const [restS, setRestS] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [detail, setDetail] = useState("");
  const [howTo, setHowTo] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const ex = await exerciseRepository.getExerciseById(id);
    if (!ex) return;
    setExercise(ex);
    // Time-based when duration_s is set and reps isn't (matches ExerciseDetailScreen).
    const isTime = !!ex.duration_s && !ex.reps;
    setMeasure(isTime ? "time" : "reps");
    setSets(String(ex.sets ?? 3));
    setWarmup(String(ex.warmup_sets ?? 0));
    setValue(String(isTime ? (ex.duration_s ?? 30) : (ex.reps ?? 10)));
    // In reps mode, duration_s is an optional time target shown alongside reps.
    setDurationOpt(!isTime && ex.duration_s ? String(ex.duration_s) : "");
    setType(ex.exercise_type);
    setEquipment(ex.equipment_type ?? "none");
    setTargetRpe(String(ex.target_rpe ?? 6));
    setRestS(ex.rest_s ? String(ex.rest_s) : "");
    setVideoUrl(ex.video_url ?? "");
    setDetail(ex.detail ?? "");
    setHowTo(ex.how_to ?? "");
    setLoaded(true);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!exercise) return;
    setSaving(true);
    const n = Number(value) || 0;
    const dur = Number(durationOpt) || 0;
    await exerciseRepository.saveExercise({
      id: exercise.id,
      phase_id: exercise.phase_id,
      name: exercise.name,
      detail: detail.trim() || null,
      sets: Number(sets) || null,
      reps: measure === "reps" ? n : null,
      duration_s: measure === "time" ? n : (dur || null),
      exercise_type: type,
      sort_order: exercise.sort_order ?? 0,
      video_url: videoUrl.trim() ? normalize(videoUrl.trim()) : null,
      how_to: howTo.trim() || null,
      warmup_sets: Number(warmup) || 0,
      archived_at: exercise.archived_at,
      equipment_type: equipment,
      target_rpe: Number(targetRpe) || null,
      rest_s: measure === "time" ? (Number(restS) || null) : null,
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
            {measure === "reps" && (
              <div className="col gap-4" style={{ flex: 1 }}>
                <span className="eyebrow">Tiempo (s)</span>
                <input style={inputStyle} type="number" inputMode="numeric" value={durationOpt} onChange={e => setDurationOpt(e.target.value)} placeholder="—" />
              </div>
            )}
          </div>

          <div className="col gap-4">
            <span className="eyebrow">Calentamientos</span>
            <input style={inputStyle} type="number" inputMode="numeric" min={0} value={warmup} onChange={e => setWarmup(e.target.value)} />
            <span className="body-sm" style={{ color: "var(--ink-3)" }}>Series de calentamiento al iniciar una sesión nueva.</span>
          </div>

          {measure === "time" && (
            <div className="col gap-4">
              <span className="eyebrow">Descanso (s)</span>
              <input style={inputStyle} type="number" inputMode="numeric" min={0} value={restS} onChange={e => setRestS(e.target.value)} placeholder="—" />
              <span className="body-sm" style={{ color: "var(--ink-3)" }}>Descanso automático entre series; al terminar arranca sola la siguiente. Vacío = manual (una a una).</span>
            </div>
          )}

          <div className="col gap-4">
            <span className="eyebrow">Tipo</span>
            <select style={inputStyle} value={type} onChange={e => setType(e.target.value as Exercise["exercise_type"])}>
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="row gap-12">
            <div className="col gap-4" style={{ flex: 1 }}>
              <span className="eyebrow">Equipamiento</span>
              <select style={inputStyle} value={equipment} onChange={e => setEquipment(e.target.value as Exercise["equipment_type"])}>
                {EQUIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="col gap-4" style={{ flex: 1 }}>
              <span className="eyebrow">RPE objetivo</span>
              <input style={inputStyle} type="number" inputMode="numeric" min={1} max={10} value={targetRpe} onChange={e => setTargetRpe(e.target.value)} />
            </div>
          </div>

          <div className="col gap-4">
            <span className="eyebrow">Video (URL YouTube)</span>
            <input style={inputStyle} type="url" inputMode="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://youtu.be/…" />
          </div>

          <div className="col gap-4">
            <span className="eyebrow">Detalle</span>
            <textarea
              style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
              value={detail}
              onChange={e => setDetail(e.target.value)}
              placeholder="Descripción breve del ejercicio…"
            />
          </div>

          <div className="col gap-4">
            <span className="eyebrow">Instrucciones (Markdown)</span>
            <textarea
              style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
              value={howTo}
              onChange={e => setHowTo(e.target.value)}
              placeholder="Pasos detallados, opcionalmente en Markdown…"
            />
            <span className="body-sm" style={{ color: "var(--ink-3)" }}>Soporta negritas, listas y enlaces en Markdown.</span>
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
