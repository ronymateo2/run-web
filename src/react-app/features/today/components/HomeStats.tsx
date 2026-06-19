import { useNavigate } from "react-router-dom";
import { Ico } from "@shared/components/icons";
import type { HomeStats as Stats } from "../hooks/useTodayData";

/** Tiny pain sparkline — last 14 days, 0–10 domain. */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 60, h = 18;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (w - 2) + 1;
      const y = h - 2 - (Math.min(v, 10) / 10) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke="var(--clay)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}

/** Seven dots, oldest → today. Filled = trained; today hollow when still pending. */
function WeekDots({ dots }: { dots: boolean[] }) {
  return (
    <div className="row gap-4" style={{ marginTop: 2 }}>
      {dots.map((on, i) => {
        const isToday = i === dots.length - 1;
        return (
          <span
            key={i}
            style={{
              width: 7, height: 7, borderRadius: 999,
              background: on ? "var(--ink)" : "transparent",
              border: on ? "none" : `1.5px ${isToday ? "solid var(--clay)" : "solid var(--faint)"}`,
              boxSizing: "border-box",
            }}
          />
        );
      })}
    </div>
  );
}

const colStyle: React.CSSProperties = {
  flex: 1, display: "flex", flexDirection: "column",
  alignItems: "flex-start", gap: 5, minWidth: 0,
};

const bigNum: React.CSSProperties = {
  fontSize: 26, lineHeight: 1, color: "var(--ink)",
};

/**
 * Slim stats band under the greeting: pain trend (7d), week adherence, total
 * sessions. The whole band taps through to the full Progress screen.
 */
export function HomeStats({ stats }: { stats: Stats }) {
  const navigate = useNavigate();
  const { painAvg7, painDelta, painSpark, weekDone, weekPlanned, weekDots, totalSessions } = stats;
  const improving = (painDelta ?? 0) < 0;

  return (
    <div
      className="card-flat mt-16 rise press"
      onClick={() => navigate("/path/progress")}
      style={{ padding: "12px 14px", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
    >
      <div className="row" style={{ alignItems: "stretch", gap: 12 }}>
        {/* Pain, last 7 days */}
        <div style={colStyle}>
          <span className="eyebrow" style={{ fontSize: 10 }}>Dolor · 7d</span>
          <span className="row gap-6" style={{ alignItems: "baseline" }}>
            <span className="num serif" style={bigNum}>
              {painAvg7 != null ? painAvg7.toFixed(1) : "—"}
            </span>
            {painDelta != null && Math.abs(painDelta) >= 0.05 && (
              <span className="num" style={{
                fontSize: 11, fontWeight: 700,
                color: improving ? "var(--moss)" : "var(--clay-deep)",
              }}>
                {improving ? "▾" : "▴"}{Math.abs(painDelta).toFixed(1)}
              </span>
            )}
          </span>
          {painSpark.length > 1
            ? <Spark values={painSpark} />
            : <span className="label" style={{ fontSize: 10 }}>registra a diario</span>}
        </div>

        <div style={{ width: 1, background: "var(--line)" }} />

        {/* Week adherence */}
        <div style={colStyle}>
          <span className="eyebrow" style={{ fontSize: 10 }}>Semana</span>
          <span className="num serif" style={bigNum}>
            {weekDone}
            {weekPlanned > 0 && (
              <span style={{ fontSize: 15, color: "var(--muted)" }}> / {weekPlanned}</span>
            )}
          </span>
          <WeekDots dots={weekDots} />
        </div>

        <div style={{ width: 1, background: "var(--line)" }} />

        {/* Total sessions */}
        <div style={colStyle}>
          <span className="eyebrow" style={{ fontSize: 10 }}>Sesiones</span>
          <span className="num serif" style={bigNum}>{totalSessions}</span>
          <span className="row gap-4 label" style={{ fontSize: 10, alignItems: "center" }}>
            en total <Ico.arrow s={10} c="var(--muted)" />
          </span>
        </div>
      </div>
    </div>
  );
}
