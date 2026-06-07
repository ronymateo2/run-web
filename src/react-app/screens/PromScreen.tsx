import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { localToday } from "../utils/timezone";
import { useSync } from "../hooks/useSync";
import { Ico } from "../components/icons";
import { BackButton } from "../components/BackButton";
import { ScreenNav } from "../components/ScreenNav";
import {
  injuryRepository,
  promRepository,
  scoreInstrument,
  instrumentsForInjury,
  type PromInstrument,
} from "../../data/repositories";

export function PromScreen() {
  const { instrumentId } = useParams<{ instrumentId: string }>();
  const { user } = useAuth();
  const push = useSync();
  const navigate = useNavigate();

  const [inst, setInst] = useState<PromInstrument | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const insts = await promRepository.getInstruments();
      const found = insts.find((i) => i.id === instrumentId) ?? null;
      if (!active) return;
      setInst(found);
      setNotFound(!found);
    })();
    return () => { active = false; };
  }, [instrumentId]);

  function setAnswer(qid: string, value: number) {
    setAnswers((a) => ({ ...a, [qid]: value }));
  }

  async function handleSave() {
    if (!user || !inst) return;
    setSaving(true);
    setSaveError(null);
    try {
      const injuries = await injuryRepository.getActiveInjuries(user.id);
      const matching = injuries.find((inj) => instrumentsForInjury([inst], inj.zone).length > 0);
      const injury = matching ?? injuries[0];
      if (!injury) {
        setSaveError("No hay lesión activa registrada.");
        setSaving(false);
        return;
      }
      await promRepository.savePromResult({
        id: crypto.randomUUID(),
        user_id: user.id,
        injury_id: injury.id,
        instrument_id: inst.id,
        date: localToday(user.timezone),
        score: scoreInstrument(inst, answers),
        answers: JSON.stringify(answers),
        note: null,
      });
      push();
      navigate("/today", { replace: true });
    } catch (err) {
      console.error("[PROM] save failed:", err);
      setSaveError("Error al guardar. Intenta de nuevo.");
      setSaving(false);
    }
  }

  if (notFound) {
    return (
      <div className="screen">
        <ScreenNav back={<BackButton fallbackPath="/today" color="var(--ink)" />}>
          <div className="eyebrow">Cuestionario</div>
          <div style={{ width: 34 }} />
        </ScreenNav>
        <div className="screen-body" style={{ paddingTop: 32 }}>
          <div className="body-sm">Cuestionario no encontrado.</div>
        </div>
      </div>
    );
  }

  if (!inst) {
    return (
      <div className="screen">
        <div className="screen-body" style={{ paddingTop: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span className="body-sm">Cargando…</span>
        </div>
      </div>
    );
  }

  const lowLabel = inst.invert ? "sin problema" : "nada";
  const highLabel = inst.invert ? "extremo" : "máximo";

  return (
    <div className="screen">
      <ScreenNav back={<BackButton fallbackPath="/today" color="var(--ink)" />}>
        <span className="eyebrow">{inst.name}</span>
        <div style={{ width: 34 }} />
      </ScreenNav>
      <div className="screen-body" style={{ paddingBottom: 100 }}>
        <div className="title-lg serif mt-12">¿Cómo está hoy?</div>
        <div className="body-sm mt-4">Responde según los últimos días. {inst.questions.length} preguntas.</div>

        <div className="col gap-16 mt-20">
          {inst.questions.map((qn) => (
            <div key={qn.id} className="card" style={{ padding: 16 }}>
              <div className="body" style={{ fontWeight: 600, marginBottom: 10 }}>{qn.text}</div>
              <div className="row between" style={{ marginBottom: 6, alignItems: "center" }}>
                <span className="body-sm" style={{ color: "var(--ink-3)" }}>{lowLabel}</span>
                <div className="num serif" style={{ fontSize: 28, color: "var(--ink)" }}>{answers[qn.id] ?? 0}</div>
                <span className="body-sm" style={{ color: "var(--ink-3)" }}>{highLabel}</span>
              </div>
              <input
                type="range" min={0} max={inst.max_per_item} value={answers[qn.id] ?? 0}
                onChange={(e) => setAnswer(qn.id, Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--clay)" }}
              />
            </div>
          ))}
        </div>

        {saveError && (
          <div style={{ color: "var(--clay)", fontSize: 13, textAlign: "center", padding: "8px 0" }}>
            {saveError}
          </div>
        )}
        <button className="btn-pill mt-20" onClick={handleSave} disabled={saving}
          style={{ width: "100%", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Guardando…" : "Guardar resultado"} {!saving && <Ico.check s={16} c="#fff" />}
        </button>
      </div>
    </div>
  );
}
