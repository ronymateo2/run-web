import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { localDayName } from "../utils/timezone";
import { useTodayData } from "../features/useTodayData";

import { HomeStats } from "../components/HomeStats";
import { SessionCard } from "../components/SessionCard";
import { NudgeSST } from "../components/NudgeSST";
import { NudgePROM } from "../components/NudgePROM";
import { BodyFigure } from "../components/BodyFigure";
import { ZoneRow } from "../components/ZoneRow";
import { Ico } from "../components/icons";

export function HomeScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data } = useTodayData();

  if (!data) {
    return (
      <div className="screen">
        <div className="screen-body" style={{ paddingTop: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span className="body-sm">Cargando…</span>
        </div>
      </div>
    );
  }

  const { focusBlocks, setsDone, checkin, sstResult, sstDue, injuries, promsDue, stats } = data;
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

        {/* Stats band — pain trend, week adherence, total sessions */}
        <HomeStats stats={stats} />

        {/* Pain check-in hero card */}
        <div
          className="card mt-20 is-hero press"
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
        </div>

        {/* Weekly quick tasks — surfaced above the (long) exercise list so they stay visible */}
        {/* 5SST nudge */}
        <NudgeSST state={sstState} lastScore={sstResult?.pain_score ?? undefined} preferred={sstDue} />

        {/* PROM nudge — every due questionnaire as its own row; user picks which */}
        {promsDue.length > 0 && <NudgePROM instruments={promsDue} />}

        {/* Today's session — one condensed card per focus injury; the full
            exercise list lives behind the phase link inside the card */}
        {focusBlocks.map((block) =>
          block.exercises.length > 0 ? (
            <SessionCard
              key={block.injury.id}
              title={isDualInjury ? `Ejercicios de ${block.injury.name.toLowerCase()}` : "Hoy toca…"}
              phase={block.phase}
              exercises={block.exercises}
              setsDone={setsDone}
            />
          ) : null
        )}

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
