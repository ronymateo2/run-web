import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useDb } from "../hooks/useDb";
import { useSync } from "../hooks/useSync";
import { Ico } from "../components/icons";
import { BackButton } from "../components/BackButton";
import {
  getPhaseById, getPhasesForInjury, getCriteria, savePhase, saveCriteria, softDeleteCriteria,
  type PhaseCriteria,
} from "../../db/queries/injuries";

interface FormState {
  name: string;
  description: string;
  week_start: string;
  week_end: string;
  threshold_pct: string;
}

const EMPTY: FormState = { name: "", description: "", week_start: "", week_end: "", threshold_pct: "70" };

export function PhaseEditScreen() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const db = useDb();
  const push = useSync();
  const navigate = useNavigate();

  const isCreate = location.pathname.endsWith("/phase/new");
  // create: id = injuryId. edit: id = phaseId.
  const [phaseId, setPhaseId] = useState<string>("");
  const [injuryId, setInjuryId] = useState<string>("");
  const [phaseNum, setPhaseNum] = useState<number>(1);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [criteria, setCriteria] = useState<PhaseCriteria[]>([]);
  const [newCriteria, setNewCriteria] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!db || !id) return;
    if (isCreate) {
      const phs = await getPhasesForInjury(db, id);
      setInjuryId(id);
      setPhaseId(crypto.randomUUID());
      setPhaseNum(Math.max(0, ...phs.map(p => p.phase_num)) + 1);
      setForm(EMPTY);
      setLoaded(true);
      return;
    }
    const phase = await getPhaseById(db, id);
    if (!phase) return;
    setPhaseId(phase.id);
    setInjuryId(phase.injury_id);
    setPhaseNum(phase.phase_num);
    setForm({
      name: phase.name,
      description: phase.description ?? "",
      week_start: String(phase.week_start),
      week_end: String(phase.week_end),
      threshold_pct: String(phase.threshold_pct),
    });
    setCriteria(await getCriteria(db, phase.id));
    setLoaded(true);
  }, [db, id, isCreate]);

  useEffect(() => { loadData(); }, [loadData]);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSavePhase() {
    if (!db || !form.name.trim()) return;
    setSaving(true);
    await savePhase({
      id: phaseId,
      injury_id: injuryId,
      phase_num: phaseNum,
      name: form.name.trim(),
      description: form.description.trim() || null,
      week_start: Number(form.week_start) || 0,
      week_end: Number(form.week_end) || 0,
      threshold_pct: Number(form.threshold_pct) || 70,
    });
    push();
    if (isCreate) {
      // Re-enter as edit so the user can add criteria to the now-existing phase.
      navigate(`/path/phase/${phaseId}/edit`, { replace: true });
    } else {
      navigate(-1);
    }
  }

  async function handleSaveCriteria(c: PhaseCriteria) {
    if (!c.description.trim()) return;
    await saveCriteria({ id: c.id, phase_id: phaseId, description: c.description.trim() });
    push();
  }

  async function handleAddCriteria() {
    if (!newCriteria.trim()) return;
    const c = { id: crypto.randomUUID(), phase_id: phaseId, description: newCriteria.trim(), done: false };
    await saveCriteria({ id: c.id, phase_id: phaseId, description: c.description });
    push();
    setCriteria(prev => [...prev, c]);
    setNewCriteria("");
  }

  async function handleDeleteCriteria(cid: string) {
    await softDeleteCriteria(cid);
    push();
    setCriteria(prev => prev.filter(c => c.id !== cid));
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

  return (
    <div className="screen">
      <div className="screen-body" style={{ paddingBottom: 120 }}>
        <div className="screen-nav">
          <BackButton fallbackPath={isCreate ? `/path/injury/${id}/edit` : `/path/injury/${injuryId}/edit`} color="var(--ink)" />
          <div className="eyebrow">{isCreate ? "Nueva fase" : `Fase ${phaseNum}`}</div>
          <div style={{ width: 34 }} />
        </div>

        <div className="title-lg serif mt-16">{isCreate ? "Crear fase" : "Editar fase"}</div>

        {/* Phase form */}
        <div className="card mt-20 col gap-12" style={{ padding: 18 }}>
          <div className="col gap-4">
            <span className="eyebrow">Nombre</span>
            <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Fase de carga" />
          </div>
          <div className="row gap-12">
            <div className="col gap-4" style={{ flex: 1 }}>
              <span className="eyebrow">Semana inicio</span>
              <input style={inputStyle} type="number" inputMode="numeric" value={form.week_start} onChange={e => set("week_start", e.target.value)} />
            </div>
            <div className="col gap-4" style={{ flex: 1 }}>
              <span className="eyebrow">Semana fin</span>
              <input style={inputStyle} type="number" inputMode="numeric" value={form.week_end} onChange={e => set("week_end", e.target.value)} />
            </div>
          </div>
          <div className="col gap-4">
            <span className="eyebrow">Umbral % para abrir la siguiente</span>
            <input style={inputStyle} type="number" inputMode="numeric" value={form.threshold_pct} onChange={e => set("threshold_pct", e.target.value)} />
          </div>
          <div className="col gap-4">
            <span className="eyebrow">Descripción</span>
            <textarea style={{ ...inputStyle, minHeight: 72, resize: "vertical" }} value={form.description} onChange={e => set("description", e.target.value)} />
          </div>
        </div>

        {/* Criteria — only once the phase exists (edit mode) */}
        {!isCreate && (
          <>
            <div className="title-md serif mt-24">Criterios</div>
            <div className="col gap-10 mt-12">
              {criteria.map((c, i) => (
                <div key={c.id} className="card row gap-8" style={{ padding: 12, alignItems: "center" }}>
                  <input
                    style={{ ...inputStyle, border: "none", background: "transparent", padding: "4px 0", flex: 1 }}
                    value={c.description}
                    onChange={e => setCriteria(prev => prev.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                    onBlur={() => handleSaveCriteria(c)}
                  />
                  <button style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }} onClick={() => handleDeleteCriteria(c.id)}>
                    <Ico.trash s={16} c="var(--clay)" />
                  </button>
                </div>
              ))}
              <div className="card row gap-8" style={{ padding: 12, alignItems: "center" }}>
                <input
                  style={{ ...inputStyle, border: "none", background: "transparent", padding: "4px 0", flex: 1 }}
                  value={newCriteria}
                  onChange={e => setNewCriteria(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddCriteria()}
                  placeholder="Nuevo criterio…"
                />
                <button style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }} onClick={handleAddCriteria}>
                  <Ico.plus s={16} c="var(--moss)" />
                </button>
              </div>
            </div>
          </>
        )}

        <div style={{ marginTop: 28 }}>
          <button className="btn-pill" onClick={handleSavePhase} disabled={saving || !form.name.trim()} style={{ opacity: saving || !form.name.trim() ? 0.6 : 1 }}>
            {isCreate ? "Crear fase" : "Guardar"} <Ico.check s={16} c="#EDE6D6" />
          </button>
        </div>
      </div>
    </div>
  );
}
