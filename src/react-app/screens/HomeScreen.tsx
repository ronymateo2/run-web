import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useAuth } from "../auth/AuthContext";
import { localDayName } from "../utils/timezone";
import { useTodayData } from "../features/useTodayData";

import { ExerciseList, countDone } from "../components/ExerciseList";
import { NudgeSST } from "../components/NudgeSST";
import { NudgePROM } from "../components/NudgePROM";
import { BodyFigure } from "../components/BodyFigure";
import { ZoneRow } from "../components/ZoneRow";
import { Ico } from "../components/icons";

export function HomeScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data } = useTodayData();

  useEffect(() => {
    if (!data) return;
    const lastId = sessionStorage.getItem("lastExerciseId");
    if (!lastId) return;
    sessionStorage.removeItem("lastExerciseId");
    requestAnimationFrame(() => {
      document.querySelector(`[data-exercise-id="${lastId}"]`)?.scrollIntoView({ block: "center", behavior: "instant" });
    });
  }, [data]);

  if (!data) {
    return (
      <div className="screen">
        <div className="screen-body" style={{ paddingTop: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span className="body-sm">Cargando…</span>
        </div>
      </div>
    );
  }

  const { focusBlocks, setsDone, checkin, sstResult, sstDue, injuries, promsDue } = data;
  const focus = focusBlocks[0]?.injury ?? null;
  const isDualInjury = injuries.length >= 2;
  const isMultiFocus = focusBlocks.length >= 2;

  const sstState = sstResult ? "done" : "pending";

  return (
    <div className="screen">
      <div className="screen-body" style={{ paddingBottom: 100 }}>
        {/* Header */}
        <div className="col gap-4" style={{ paddingTop: 12 }}>
          <div className="eyebrow">{localDayName(user?.timezone)}</div>
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
        <motion.div
          className="card mt-20 is-hero"
          whileTap={{ scale: 0.985 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          style={{ padding: "14px 14px 16px", position: "relative", overflow: "hidden", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
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
              <div className="col gap-4 mt-8">
                {checkin ? (
                  Object.entries(checkin.zones)
                    .filter(([, v]) => (v as number) > 0)
                    .map(([zone, v]) => (
                      <ZoneRow key={zone} name={zoneLabel(zone)} value={v as number} compact />
                    ))
                ) : (
                  <div className="body-sm">Toca para registrar tus zonas de dolor.</div>
                )}
              </div>
            </div>
            <div style={{ width: 130, marginLeft: 4, display: "flex", justifyContent: "center", alignItems: "center" }}>
              <div className="drift">
                <BodyFigure w={130} crop heat={checkin?.zones} />
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
        </motion.div>

        {/* Weekly quick tasks — surfaced above the (long) exercise list so they stay visible */}
        {/* 5SST nudge */}
        <NudgeSST state={sstState} lastScore={sstResult?.pain_score ?? undefined} preferred={sstDue} />

        {/* PROM nudge — every due questionnaire as its own row; user picks which */}
        {promsDue.length > 0 && <NudgePROM instruments={promsDue} />}

        {/* Today's exercises — one block per focus injury */}
        {focusBlocks.map((block) => {
          const blockDone = countDone(block.exercises, setsDone);
          return block.exercises.length > 0 ? (
            <div key={block.injury.id}>
              <div className="row between mt-24" style={{ alignItems: "baseline" }}>
                <div className="title-md serif">
                  {isDualInjury ? `Ejercicios de ${block.injury.name.toLowerCase()}` : "Hoy toca…"}
                </div>
                <div className="label num">{blockDone} / {block.exercises.length} hechos</div>
              </div>
              {block.phase && (
                <div className="eyebrow mt-4">{block.phase.name}</div>
              )}
              <div className="bar mt-8" style={{ background: "rgba(31,58,46,0.08)" }}>
                <motion.div
                  className="bar-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${block.exercises.length ? (blockDone / block.exercises.length) * 100 : 0}%` }}
                  transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.1 }}
                  style={{ background: "var(--ink)" }}
                />
              </div>
              <ExerciseList exercises={block.exercises} setsDone={setsDone} />
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
            </div>
          ))}
      </div>

    </div>
  );
}

function zoneLabel(key: string): string {
  const labels: Record<string, string> = {
    cuello: "Cuello", ingleL: "Ingle izquierda",
    caderaL: "Cadera izquierda",
    pubis: "Pubis", hombroI: "Hombro izquierdo", hombroD: "Hombro izquierdo", lumbar: "Lumbar",
  };
  return labels[key] ?? key;
}
