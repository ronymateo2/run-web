import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Reorder, useDragControls } from "motion/react";
import { useSync } from "../hooks/useSync";
import { Ico } from "../components/icons";
import { BackButton } from "../components/BackButton";
import { ScreenNav } from "../components/ScreenNav";
import { injuryRepository, exerciseRepository, type Phase, type Exercise } from "../../data/repositories";

/** "3 × 10" / "3 × 30s" summary line, mirrors ExerciseEditScreen's measure model. */
function summary(ex: Exercise): string {
  const sets = ex.sets ?? 1;
  if (ex.reps) return `${sets} × ${ex.reps}`;
  if (ex.duration_s) return `${sets} × ${ex.duration_s}s`;
  return `${sets} series`;
}

// Category label + accent, mirrors ExerciseEditScreen's TYPE_OPTIONS.
const TYPE_META: Record<Exercise["exercise_type"], { label: string; color: string }> = {
  isometric: { label: "Isométrico", color: "var(--clay)" },
  strength: { label: "Fuerza", color: "var(--moss)" },
  mobility: { label: "Movilidad", color: "var(--sun)" },
  cardio: { label: "Cardio", color: "#7B8FA1" },
};

function TypeChip({ type }: { type: Exercise["exercise_type"] }) {
  const meta = TYPE_META[type];
  return (
    <span className="chip" style={{ fontSize: 11, letterSpacing: "0.02em" }}>
      <span className="dot" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

export function PhaseExercisesEditScreen() {
  const { id } = useParams<{ id: string }>();
  const push = useSync();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase | null>(null);
  const [active, setActive] = useState<Exercise[]>([]);
  const [archived, setArchived] = useState<Exercise[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Latest active order, read on drag end (state closure in the handler is stale).
  const activeRef = useRef<Exercise[]>([]);
  activeRef.current = active;

  const loadData = useCallback(async () => {
    if (!id) return;
    const ph = await injuryRepository.getPhaseById(id);
    if (!ph) return;
    setPhase(ph);
    setActive(await exerciseRepository.getExercisesForPhase(id));
    setArchived(await exerciseRepository.getArchivedExercisesForPhase(id));
    setLoaded(true);
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Persist the current order (index = sort_order). Called when a drag settles.
  async function persistOrder() {
    const rows = activeRef.current;
    const byId = new Map(rows.map(e => [e.id, e]));
    await exerciseRepository.reorderExercises(rows.map(e => e.id), byId);
    push();
  }

  async function archive(ex: Exercise) {
    await exerciseRepository.setExerciseArchived(ex.id, true);
    push();
    setActive(prev => prev.filter(e => e.id !== ex.id));
    setArchived(prev => [...prev, ex]);
  }

  async function restore(ex: Exercise) {
    await exerciseRepository.setExerciseArchived(ex.id, false);
    push();
    setArchived(prev => prev.filter(e => e.id !== ex.id));
    setActive(prev => [...prev, ex]);
  }

  if (!loaded) return (
    <div className="screen">
      <div className="screen-body" style={{ paddingTop: 32 }}><span className="body-sm">Cargando…</span></div>
    </div>
  );

  return (
    <div className="screen">
      <ScreenNav back={<BackButton fallbackPath={`/path/phase/${id}/edit`} color="var(--ink)" />}>
        <div className="eyebrow">{phase ? `Fase ${phase.phase_num}` : "Fase"}</div>
        <div style={{ width: 34 }} />
      </ScreenNav>
      <div className="screen-body" style={{ paddingBottom: 120 }}>

        <div className="title-lg serif mt-16">Editar ejercicios</div>
        <div className="body-sm mt-8" style={{ color: "var(--ink-3)" }}>
          Arrastra para reordenar. Archivar quita el ejercicio del plan sin borrar tu historial.
        </div>

        {active.length === 0 ? (
          <div className="card-flat" style={{ marginTop: 20, padding: "24px 18px", textAlign: "center" }}>
            <div className="body-sm">No hay ejercicios activos en esta fase.</div>
          </div>
        ) : (
          <Reorder.Group axis="y" values={active} onReorder={setActive} style={{ listStyle: "none", padding: 0, margin: "16px 0 0", display: "flex", flexDirection: "column", gap: 10 }}>
            {active.map(ex => (
              <ActiveRow
                key={ex.id}
                ex={ex}
                onEdit={() => navigate(`/today/exercise/${ex.id}/edit`)}
                onArchive={() => archive(ex)}
                onSettle={persistOrder}
              />
            ))}
          </Reorder.Group>
        )}

        {archived.length > 0 && (
          <>
            <div className="title-md serif mt-24">Archivados</div>
            <div className="col gap-10 mt-12">
              {archived.map(ex => (
                <div key={ex.id} className="card row between" style={{ padding: "12px 14px", alignItems: "center", opacity: 0.7 }}>
                  <div className="col" style={{ minWidth: 0 }}>
                    <span className="body" style={{ color: "var(--ink)", fontWeight: 600 }}>{ex.name}</span>
                    <span className="row gap-8 mt-4" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <TypeChip type={ex.exercise_type} />
          <span className="body-sm" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{summary(ex)}</span>
        </span>
                  </div>
                  <button
                    className="row gap-4"
                    onClick={() => restore(ex)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 6, alignItems: "center", color: "var(--moss)", flexShrink: 0 }}
                  >
                    <Ico.refresh s={16} c="var(--moss)" />
                    <span className="body-sm" style={{ fontWeight: 600 }}>Restaurar</span>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface RowProps {
  ex: Exercise;
  onEdit: () => void;
  onArchive: () => void;
  onSettle: () => void;
}

/** A draggable active-exercise row. Drag starts only from the grip handle so the
 *  Editar/Archivar buttons stay tappable. */
function ActiveRow({ ex, onEdit, onArchive, onSettle }: RowProps) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={ex}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onSettle}
      className="card row gap-10"
      style={{ padding: "12px 14px", alignItems: "center" }}
    >
      <span
        onPointerDown={e => controls.start(e)}
        style={{ cursor: "grab", touchAction: "none", display: "flex", flexShrink: 0, color: "var(--muted)" }}
      >
        <Ico.grip s={20} c="var(--muted)" />
      </span>
      <div className="col" style={{ flex: 1, minWidth: 0 }}>
        <span className="body" style={{ color: "var(--ink)", fontWeight: 600 }}>{ex.name}</span>
        <span className="row gap-8 mt-4" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <TypeChip type={ex.exercise_type} />
          <span className="body-sm" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{summary(ex)}</span>
        </span>
      </div>
      <button onClick={onEdit} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, flexShrink: 0 }} aria-label="Editar">
        <Ico.pencil s={16} c="var(--ink)" />
      </button>
      <button onClick={onArchive} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, flexShrink: 0 }} aria-label="Archivar">
        <Ico.archive s={16} c="var(--clay)" />
      </button>
    </Reorder.Item>
  );
}
