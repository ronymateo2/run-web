import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useDb } from "../hooks/useDb";
import { useSync } from "../hooks/useSync";
import { Ico } from "../components/icons";
import { BackButton } from "../components/BackButton";
import { ScreenNav } from "../components/ScreenNav";
import {
  getInjuryById, getPhasesForInjury, updateInjuryEdit, softDeletePhase,
  type Injury, type Phase,
} from "../../db/queries/injuries";

const WEEKDAYS: { key: string; label: string }[] = [
  { key: "mon", label: "L" }, { key: "tue", label: "M" }, { key: "wed", label: "X" },
  { key: "thu", label: "J" }, { key: "fri", label: "V" }, { key: "sat", label: "S" },
  { key: "sun", label: "D" },
];

export function InjuryEditScreen() {
  const { id } = useParams<{ id: string }>();
  const { lastSyncAt } = useAuth();
  const db = useDb();
  const push = useSync();
  const navigate = useNavigate();

  const [injury, setInjury] = useState<Injury | null>(null);
  const [phaseList, setPhaseList] = useState<Phase[]>([]);
  const [currentPhaseId, setCurrentPhaseId] = useState<string>("");
  const [focusDays, setFocusDays] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!db || !id) return;
    const inj = await getInjuryById(db, id);
    if (!inj) return;
    const phs = await getPhasesForInjury(db, id);
    setInjury(inj);
    setPhaseList(phs);
    setCurrentPhaseId(inj.current_phase_id ?? "");
    try { setFocusDays(inj.focus_days ? (JSON.parse(inj.focus_days) as string[]) : []); }
    catch { setFocusDays([]); }
  }, [db, id]);

  useEffect(() => { loadData(); }, [loadData, lastSyncAt]);

  function toggleDay(key: string) {
    setFocusDays(prev => prev.includes(key) ? prev.filter(d => d !== key) : [...prev, key]);
  }

  async function handleSave() {
    if (!db || !id) return;
    setSaving(true);
    await updateInjuryEdit(id, currentPhaseId || null, focusDays);
    push();
    navigate(-1);
  }

  async function confirmDeletePhase() {
    if (!db || !deleteTarget) return;
    await softDeletePhase(deleteTarget.id);
    setDeleteTarget(null);
    push();
    await loadData();
  }

  if (!injury) return (
    <div className="screen">
      <div className="screen-body" style={{ paddingTop: 32 }}><span className="body-sm">Cargando…</span></div>
    </div>
  );

  return (
    <div className="screen">
      <ScreenNav>
        <BackButton fallbackPath="/path" color="var(--ink)" />
        <div className="eyebrow">Editar lesión</div>
        <div style={{ width: 34 }} />
      </ScreenNav>
      <div className="screen-body" style={{ paddingBottom: 120 }}>

        <div className="eyebrow mt-16" style={{ color: "var(--clay-deep)" }}>{injury.zone}</div>
        <div className="title-lg serif mt-6" style={{ lineHeight: 1.1 }}>{injury.name}</div>

        {/* Fase actual */}
        <div className="card mt-20" style={{ padding: 18 }}>
          <div className="eyebrow">Fase actual</div>
          <select
            value={currentPhaseId}
            onChange={(e) => setCurrentPhaseId(e.target.value)}
            style={{
              marginTop: 10, width: "100%", padding: "12px 14px", borderRadius: 12,
              border: "1px solid var(--line-2)", background: "var(--card)",
              fontFamily: "inherit", fontSize: 15, color: "var(--ink)",
            }}
          >
            <option value="">Ninguna</option>
            {phaseList.map(p => (
              <option key={p.id} value={p.id}>Fase {p.phase_num} · {p.name}</option>
            ))}
          </select>
        </div>

        {/* Días de enfoque */}
        <div className="card mt-12" style={{ padding: 18 }}>
          <div className="eyebrow">Días de enfoque</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {WEEKDAYS.map(d => {
              const active = focusDays.includes(d.key);
              return (
                <button
                  key={d.key}
                  onClick={() => toggleDay(d.key)}
                  style={{
                    width: 34, height: 34, borderRadius: 999, cursor: "pointer",
                    fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600,
                    border: active ? "none" : "1px solid var(--line)",
                    background: active ? "var(--moss)" : "transparent",
                    color: active ? "#fff" : "var(--muted)",
                  }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Fases */}
        <div className="row between mt-24" style={{ alignItems: "center" }}>
          <div className="title-md serif">Fases</div>
          <button
            className="btn-pill ghost"
            style={{ width: "auto", height: 38, padding: "0 16px" }}
            onClick={() => navigate(`/path/injury/${injury.id}/phase/new`)}
          >
            <Ico.plus s={14} c="var(--ink)" /> Nueva fase
          </button>
        </div>

        <div className="col gap-10 mt-12">
          {phaseList.length === 0 && (
            <div className="body-sm" style={{ color: "var(--ink-3)" }}>Aún no hay fases.</div>
          )}
          {phaseList.map(p => (
            <div key={p.id} className="card" style={{ padding: 14 }}>
              <div className="row between" style={{ alignItems: "center" }}>
                <button
                  style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", flex: 1, padding: 0 }}
                  onClick={() => navigate(`/path/phase/${p.id}/edit`)}
                >
                  <div className="eyebrow">Fase {p.phase_num} · semana {p.week_start}–{p.week_end}</div>
                  <div className="body" style={{ fontWeight: 600, marginTop: 2 }}>{p.name}</div>
                </button>
                <div className="row gap-4" style={{ alignItems: "center" }}>
                  <button
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 8 }}
                    onClick={() => navigate(`/path/phase/${p.id}/edit`)}
                  >
                    <Ico.pencil s={16} c="var(--muted)" />
                  </button>
                  <button
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 8 }}
                    onClick={() => setDeleteTarget({ id: p.id, name: p.name })}
                  >
                    <Ico.trash s={16} c="var(--clay)" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 28 }}>
          <button className="btn-pill" onClick={handleSave} disabled={saving} style={{ opacity: saving ? 0.6 : 1 }}>
            Guardar <Ico.check s={16} c="#EDE6D6" />
          </button>
        </div>
      </div>

      {deleteTarget && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "flex-end" }}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            style={{ background: "var(--bg)", borderRadius: "20px 20px 0 0", padding: "28px 20px 48px", width: "100%" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="title-md serif">¿Eliminar fase?</div>
            <div className="body-sm mt-8" style={{ color: "var(--ink-3)" }}>
              <strong style={{ color: "var(--ink)" }}>{deleteTarget.name}</strong> y sus criterios serán eliminados. No se puede deshacer.
            </div>
            <div className="col gap-10 mt-24">
              <button
                className="btn-pill"
                style={{ background: "var(--clay)", color: "#fff" }}
                onClick={confirmDeletePhase}
              >
                Eliminar fase
              </button>
              <button className="btn-pill ghost" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
