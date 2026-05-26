import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useDb } from "../hooks/useDb";
import { TabBar } from "../components/TabBar";
import { ExerciseRow } from "../components/ExerciseRow";
import { NudgeSST } from "../components/NudgeSST";
import { BodyFigure } from "../components/BodyFigure";
import { ZoneRow } from "../components/ZoneRow";
import { Ico } from "../components/icons";
import { getActiveInjuries, getTodayFocusInjuries, getCurrentPhase, type Injury, type Phase } from "../../db/queries/injuries";
import { getExercisesForPhase, getTodayLogs, type Exercise, type ExerciseLog } from "../../db/queries/exercises";
import { getTodayCheckin, type PainCheckin } from "../../db/queries/checkins";
import { getTodaySst, isSstDueToday, type SstResult } from "../../db/queries/sst";
import { pullDelta, pushDelta } from "../../db/sync";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dayName() {
  return new Intl.DateTimeFormat("es", { weekday: "long" }).format(new Date());
}

interface FocusBlock {
  injury: Injury;
  phase: Phase | null;
  exercises: Exercise[];
}

interface HomeData {
  injuries: Injury[];
  focusBlocks: FocusBlock[];
  doneIds: Set<string>;
  checkin: PainCheckin | null;
  sstResult: SstResult | null;
  sstDue: boolean;
}

export function HomeScreen() {
  const { user, token } = useAuth();
  const db = useDb();
  const navigate = useNavigate();
  const [data, setData] = useState<HomeData | null>(null);
  const [syncing, setSyncing] = useState(false);

  const loadData = useCallback(async () => {
    if (!db || !user) return;
    const dateStr = today();
    const injuries = await getActiveInjuries(db, user.id);
    const focusInjuries = getTodayFocusInjuries(injuries);
    const focusBlocks: FocusBlock[] = await Promise.all(
      focusInjuries.map(async (injury) => {
        const phase = await getCurrentPhase(db, injury);
        const exercises = phase ? await getExercisesForPhase(db, phase.id) : [];
        return { injury, phase, exercises };
      })
    );
    const logs = await getTodayLogs(db, user.id, dateStr);
    const doneIds = new Set(logs.map((l: ExerciseLog) => l.exercise_id));
    const checkin = await getTodayCheckin(db, user.id, dateStr);
    const sstResult = await getTodaySst(db, user.id, dateStr);
    const sstDue = isSstDueToday();
    setData({ injuries, focusBlocks, doneIds, checkin, sstResult, sstDue });
  }, [db, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleForceSync = useCallback(async () => {
    if (!db || !token || syncing) return;
    setSyncing(true);
    try {
      await pushDelta(db, token);
      await pullDelta(db, token, { force: true });
      await loadData();
    } finally {
      setSyncing(false);
    }
  }, [db, token, syncing, loadData]);

  if (!data) {
    return (
      <div className="screen">
        <div className="screen-body" style={{ paddingTop: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span className="body-sm">Cargando…</span>
        </div>
        <TabBar />
      </div>
    );
  }

  const { focusBlocks, doneIds, checkin, sstResult, sstDue, injuries } = data;
  const focus = focusBlocks[0]?.injury ?? null;
  const isDualInjury = injuries.length >= 2;
  const isMultiFocus = focusBlocks.length >= 2;

  const sstState = !sstDue ? "hidden" : sstResult ? "done" : "pending";

  return (
    <div className="screen">
      <div className="screen-body" style={{ paddingBottom: 100 }}>
        {/* Header */}
        <div className="col gap-4" style={{ paddingTop: 12 }}>
          <div className="row between" style={{ alignItems: "center" }}>
            <div className="eyebrow">{dayName()}</div>
            <button
              onClick={handleForceSync}
              disabled={syncing}
              style={{
                background: "none", border: "none", cursor: syncing ? "default" : "pointer",
                padding: 4, opacity: syncing ? 0.4 : 0.55, display: "flex", alignItems: "center",
              }}
              title="Sincronizar"
            >
              <Ico.refresh s={16} />
            </button>
          </div>
          {isDualInjury && focus ? (
            <div className="title-lg serif">
              Hoy es día de{" "}
              <em style={{ fontStyle: "italic", color: "var(--clay-deep)" }}>
                {isMultiFocus
                  ? focusBlocks.map(b => b.injury.name.toLowerCase()).join(" / ")
                  : focus.name.toLowerCase()}
              </em>.
            </div>
          ) : (
            <div className="title-lg serif">
              Buen día,{" "}
              <em style={{ fontStyle: "italic", color: "var(--clay-deep)" }}>
                {user?.name?.split(" ")[0] ?? ""}
              </em>.
            </div>
          )}
          {focusBlocks.length === 1 && focusBlocks[0].phase && (
            <div className="body-sm" style={{ marginTop: 2 }}>
              {focusBlocks[0].injury.name} · {focusBlocks[0].phase.name}
            </div>
          )}
        </div>

        {/* Pain check-in hero card */}
        <div
          className="card mt-20 is-hero"
          style={{ padding: 18, position: "relative", overflow: "hidden", cursor: "pointer" }}
          onClick={() => navigate("/today/checkin")}
        >
          <div className="eyebrow">
            {checkin ? "Dolor registrado hoy" : "Registrar dolor de hoy"}
          </div>
          <div className="row between mt-8" style={{ alignItems: "flex-start" }}>
            <div className="col" style={{ flex: 1 }}>
              <div className="title-md serif" style={{ lineHeight: 1.05 }}>
                {checkin ? "¿Cómo va el cuerpo?" : "¿Cómo sientes hoy?"}
              </div>
              <div className="col gap-8 mt-12">
                {checkin ? (
                  Object.entries(checkin.zones)
                    .filter(([, v]) => (v as number) > 0)
                    .map(([zone, v]) => (
                      <ZoneRow key={zone} name={zoneLabel(zone)} value={v as number} />
                    ))
                ) : (
                  <div className="body-sm">Toca para registrar tus zonas de dolor.</div>
                )}
              </div>
            </div>
            <div style={{ width: 88, marginLeft: 8 }}>
              <div className="drift">
                <BodyFigure w={88} heat={checkin?.zones} />
              </div>
            </div>
          </div>
          {!checkin && (
            <button className="row gap-6" style={{
              marginTop: 14, padding: "10px 14px", borderRadius: 999,
              background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink)",
              fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
              cursor: "pointer",
            }}>
              Registrar dolor <Ico.arrow s={14} />
            </button>
          )}
        </div>

        {/* Today's exercises — one block per focus injury */}
        {focusBlocks.map((block) => {
          const blockDone = block.exercises.filter(e => doneIds.has(e.id)).length;
          return block.exercises.length > 0 ? (
            <div key={block.injury.id}>
              <div className="row between mt-24" style={{ alignItems: "baseline" }}>
                <div className="title-md serif">
                  {isDualInjury ? `Ejercicios de ${block.injury.name.toLowerCase()}` : "Hoy toca…"}
                </div>
                <div className="label num">{blockDone} / {block.exercises.length} hechos</div>
              </div>
              <div className="bar mt-8" style={{ background: "rgba(31,58,46,0.08)" }}>
                <div className="bar-fill" style={{ width: `${block.exercises.length ? (blockDone / block.exercises.length) * 100 : 0}%`, background: "var(--ink)" }} />
              </div>
              <div className="col gap-10 mt-16">
                {block.exercises.map((e) => (
                  <ExerciseRow
                    key={e.id} id={e.id} name={e.name} detail={e.detail}
                    mins={e.sets && e.reps ? Math.ceil((e.sets * e.reps * 4) / 60) : undefined}
                    done={doneIds.has(e.id)} phase={block.phase?.name}
                  />
                ))}
              </div>
            </div>
          ) : null;
        })}

        {/* Maintenance card for non-focus injuries */}
        {injuries
          .filter(inj => !focusBlocks.some(b => b.injury.id === inj.id))
          .map(inj => (
            <div key={inj.id} className="card mt-20" style={{
              padding: 16, border: "1.5px dashed var(--line-2)",
              background: "transparent", boxShadow: "none",
            }}>
              <div className="eyebrow">Mantenimiento · {inj.name}</div>
              <div className="body-sm mt-4" style={{ color: "var(--ink-3)", lineHeight: 1.5 }}>
                Isométricos suaves — 1 set de 10s × 5. Sin carga adicional hoy.
              </div>
            </div>
          ))}

        {/* 5SST nudge */}
        <NudgeSST state={sstState} lastScore={sstResult?.pain_score} />
      </div>

      <TabBar />
    </div>
  );
}

function zoneLabel(key: string): string {
  const labels: Record<string, string> = {
    ingleL: "Ingle izquierda", ingleR: "Ingle derecha",
    caderaL: "Cadera izquierda", caderaR: "Cadera derecha",
    pubis: "Pubis", hombroD: "Hombro derecho", lumbar: "Lumbar",
  };
  return labels[key] ?? key;
}
