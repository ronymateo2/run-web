// Voice-guided, hands-free player for rep-hold exercises (e.g. glute bridge: 3×10, hold 3s).
// All session logic (TTS cues, drift-free timer, phase→rep→set advance, completion logging)
// lives in useGuidedPlayer; this screen only renders the current state.
import type { ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCountdownSeconds } from "../hooks/useCountdown";
import { useGuidedPlayer } from "../hooks/useGuidedPlayer";
import { Ico } from "@shared/components/icons";
import { BackButton } from "@shared/components/BackButton";
import { ScreenNav } from "@shared/components/ScreenNav";
import type { Exercise } from "@data/repositories";

type Player = ReturnType<typeof useGuidedPlayer>;

const BONE_FAINT = "rgba(237,230,214,0.55)";
const BONE_SOFT = "rgba(237,230,214,0.65)";

const RING_RADIUS = 72;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
// Static keyframes injected once: the ring sweep (offset full→0) and the transition flash.
// Both are GPU/compositor-driven, so neither costs a React render while running.
const KEYFRAMES = `
@keyframes guidedRingSweep { from { stroke-dashoffset: ${CIRCUMFERENCE}px; } to { stroke-dashoffset: 0; } }
@keyframes guidedFlash { from { opacity: 0.45; } to { opacity: 0; } }
`;

export function GuidedExerciseScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const player = useGuidedPlayer(id);

  const exitPath = `/today/exercise/${id}`;
  const exit = () => navigate(exitPath, { replace: true });
  const stopAndExit = () => { player.stop(); exit(); };

  const { exercise, phases, screen } = player;
  const noGuide = !!exercise && phases.length === 0;

  return (
    <div className="screen screen-dark">
      <style>{KEYFRAMES}</style>
      {player.flashKey > 0 && (
        <div
          key={player.flashKey}
          style={{
            position: "fixed", inset: 0, background: "var(--bone)", pointerEvents: "none", zIndex: 5,
            opacity: 0, animation: "guidedFlash 0.45s ease-out forwards",
          }}
        />
      )}
      <ScreenNav back={<BackButton fallbackPath={exitPath} color="var(--bone)" />}>
        <span className="eyebrow" style={{ color: BONE_FAINT }}>Modo guiado</span>
        <div style={{ width: 34 }} />
      </ScreenNav>
      <div className="screen-body" style={{ paddingBottom: 80, display: "flex", flexDirection: "column", flex: 1 }}>
        {noGuide && <NoGuideView onExit={exit} />}
        {!noGuide && screen === "intro" && exercise && <IntroView player={player} exercise={exercise} />}
        {!noGuide && (screen === "run" || screen === "ready" || screen === "represt") && (
          <RunView player={player} onStop={stopAndExit} />
        )}
        {!noGuide && screen === "done" && <DoneView sets={player.sets} onExit={exit} />}
      </div>
    </div>
  );
}

// Centered column shared by every state view.
function CenterCol({ gap, children }: { gap: number; children: ReactNode }) {
  return (
    <div className="col" style={{ flex: 1, justifyContent: "center", alignItems: "center", gap, textAlign: "center" }}>
      {children}
    </div>
  );
}

function NoGuideView({ onExit }: { onExit: () => void }) {
  return (
    <CenterCol gap={20}>
      <div className="body-sm" style={{ color: BONE_SOFT, maxWidth: 280 }}>
        Este ejercicio no tiene fases configuradas. Agrégalas en "Editar ejercicio".
      </div>
      <button className="btn-pill alt" style={{ maxWidth: 280 }} onClick={onExit}>
        Volver
      </button>
    </CenterCol>
  );
}

function IntroView({ player, exercise }: { player: Player; exercise: Exercise }) {
  const { sets, reps, phases } = player;
  return (
    <CenterCol gap={24}>
      <div className="title-lg serif" style={{ color: "var(--bone)", lineHeight: 1.1 }}>
        {exercise.name}
      </div>
      <div className="body-sm" style={{ color: BONE_SOFT, maxWidth: 300, lineHeight: 1.6 }}>
        {sets} {sets === 1 ? "serie" : "series"}{reps > 1 ? ` × ${reps} reps` : ""}. La voz te guía: {phases.map(p => p.cue).join(" · ")}.
      </div>
      <button className="btn-pill alt" style={{ width: "100%", maxWidth: 280 }} onClick={player.begin}>
        Comenzar <Ico.play s={16} c="#fff" />
      </button>
    </CenterCol>
  );
}

function RunView({ player, onStop }: { player: Player; onStop: () => void }) {
  const { screen, set, sets, rep, reps, phases, phaseIdx, segTotal, segKey } = player;
  const resting = screen === "ready" || screen === "represt";
  const eyebrow = screen === "ready" ? "PREPÁRATE"
    : screen === "represt" ? "DESCANSA"
    : (phases[phaseIdx]?.cue.toUpperCase() ?? "");

  return (
    <CenterCol gap={20}>
      {/* Per-set pips */}
      <div className="row gap-6">
        {Array.from({ length: sets }).map((_, i) => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: 999,
            background: i < set - 1 ? "var(--clay)" : i === set - 1 ? "var(--bone)" : "rgba(237,230,214,0.2)",
          }} />
        ))}
      </div>

      {/* Ring timer */}
      <div style={{ position: "relative", width: 180, height: 180 }}>
        {/* Explicit left/top: svg is display:inline, so an absolute with auto offsets takes
            its static position — which CenterCol's text-align: center would shift right. */}
        <svg width={180} height={180} style={{ position: "absolute", left: 0, top: 0, transform: "rotate(-90deg)" }}>
          <circle cx={90} cy={90} r={RING_RADIUS} fill="none" stroke="rgba(237,230,214,0.1)" strokeWidth={6} />
          <circle
            key={segKey}
            cx={90} cy={90} r={RING_RADIUS} fill="none"
            stroke={resting ? "var(--moss)" : "var(--clay)"}
            strokeWidth={6} strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE}
            style={{ animation: segTotal > 0 ? `guidedRingSweep ${segTotal}s linear forwards` : "none" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <SecondsLeft timer={player.timer} />
          <div className="eyebrow" style={{ color: BONE_FAINT, marginTop: 4 }}>
            {eyebrow}
          </div>
        </div>
      </div>

      <div className="title-md serif" style={{ color: "var(--bone)" }}>
        Serie {set}/{sets} · Rep {rep}/{reps}
      </div>

      <button className="btn-pill" onClick={onStop} style={{ maxWidth: 200 }}>
        Detener <Ico.stop s={16} c="var(--bone)" />
      </button>
    </CenterCol>
  );
}

// 1Hz leaf: subscribing here means each tick re-renders only this number,
// not the whole screen (SVG ring, pips, buttons) — the point of useCountdownSeconds.
function SecondsLeft({ timer }: { timer: Player["timer"] }) {
  const secondsLeft = useCountdownSeconds(timer);
  return (
    <div className="num" style={{ fontSize: 52, color: "var(--bone)", lineHeight: 1 }}>
      {secondsLeft}
    </div>
  );
}

function DoneView({ sets, onExit }: { sets: number; onExit: () => void }) {
  return (
    <CenterCol gap={24}>
      <div className="title-lg serif" style={{ color: "var(--bone)", lineHeight: 1.1 }}>
        ¡{sets} {sets === 1 ? "serie" : "series"} completadas!
      </div>
      <button className="btn-pill alt" style={{ width: "100%", maxWidth: 280 }} onClick={onExit}>
        Listo <Ico.check s={16} c="#fff" />
      </button>
    </CenterCol>
  );
}
