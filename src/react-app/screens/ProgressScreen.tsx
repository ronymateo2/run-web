import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { BackButton } from "../components/BackButton";
import { ScreenNav } from "../components/ScreenNav";
import { checkinRepository, sstRepository, promRepository, severityBand, promTrend, type PainCheckin, type SstResult, type PromInstrument, type PromResult } from "../../data/repositories";
import { Ico } from "../components/icons";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

const ZONE_COLORS: Record<string, string> = {
  cuello: "rgba(176,124,168,0.7)", ingleL: "rgba(217,119,87,0.7)",
  caderaL: "rgba(58,82,109,0.6)",
  pubis: "rgba(232,184,92,0.7)", hombroI: "rgba(138,168,140,0.8)", hombroD: "rgba(138,168,140,0.8)",
};

interface Segment { date: string; zones: Record<string, number | undefined>; avg: number; }

function buildSegments(checkins: PainCheckin[]): Segment[] {
  return [...checkins].reverse().map(c => ({
    date: c.date,
    zones: c.zones,
    avg: (Object.values(c.zones) as (number | undefined)[]).reduce<number>((a, b) => a + (b ?? 0), 0) / Math.max(1, (Object.values(c.zones) as (number | undefined)[]).filter(v => (v ?? 0) > 0).length),
  }));
}

interface ProgressData {
  segments: Segment[];
  sst: SstResult[];
  instruments: PromInstrument[];
  proms: PromResult[];
}

export function ProgressScreen() {
  const { user, lastSyncAt } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<ProgressData | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const checkins = await checkinRepository.getRecentCheckins(user.id, 30);
      const sst = await sstRepository.getRecentSst(user.id, 12);
      const instruments = await promRepository.getInstruments();
      const proms = await promRepository.getRecentProm(user.id, 60);
      const segments = buildSegments(checkins);
      if (active) setData({ segments, sst, instruments, proms });
    })();
    return () => { active = false; };
  }, [user, lastSyncAt]);

  const segments = data?.segments ?? [];
  const n = segments.length;

  const activeZones = Object.keys(ZONE_COLORS).filter(k =>
    segments.some(s => (s.zones[k] ?? 0) > 0)
  );

  return (
    <div className="screen">
      <ScreenNav back={<BackButton fallbackPath="/path" color="var(--ink)" />}>
        <div className="eyebrow">Progreso</div>
        <div style={{ width: 34 }} />
      </ScreenNav>
      <div className="screen-body" style={{ paddingBottom: 100 }}>

        <div className="title-lg serif mt-12">La marea del dolor.</div>
        <div className="body-sm mt-4">Últimos 30 días · por zona.</div>

        {/* Pain sparklines */}
        <div className="card mt-20" style={{ padding: 18 }}>
          {n > 1 ? (
            <div style={{ width: "100%", height: 140 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={segments} margin={{ top: 6, right: 6, bottom: 6, left: 6 }}>
                  {activeZones.map(zone => (
                    <Line
                      key={zone}
                      type="monotone"
                      dataKey={`zones.${zone}`}
                      stroke={ZONE_COLORS[zone] ?? "rgba(200,200,200,0.3)"}
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                  <XAxis dataKey="date" hide />
                  <YAxis domain={[0, 10]} hide />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", fontSize: 12 }}
                    labelStyle={{ color: "var(--ink-3)", fontSize: 11 }}
                    itemStyle={{ fontSize: 12 }}
                    formatter={(value, name) => [value as number, zoneLabel((name as string).replace("zones.", ""))]}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="col" style={{ height: 140, alignItems: "center", justifyContent: "center" }}>
              <div className="body-sm">Sin datos aún. Registra dolor cada día.</div>
            </div>
          )}
          {/* Legend */}
          <div className="row gap-10 mt-12" style={{ flexWrap: "wrap" }}>
            {activeZones.map(z => (
              <span key={z} className="row gap-4" style={{ alignItems: "center", fontSize: 11, color: "var(--ink-3)" }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: ZONE_COLORS[z] ?? "var(--line)" }} />
                {zoneLabel(z)}
              </span>
            ))}
          </div>
        </div>

        {/* Average trend */}
        {n > 0 && (
          <div className="row gap-12 mt-16" style={{ alignItems: "stretch" }}>
            <div className="card" style={{ flex: 1, padding: 16 }}>
              <div className="eyebrow">promedio hoy</div>
              <div className="num serif" style={{ fontSize: 36, color: "var(--ink)", lineHeight: 1, marginTop: 6 }}>
                {segments[segments.length - 1]?.avg.toFixed(1) ?? "—"}
              </div>
            </div>
            <div className="card" style={{ flex: 1, padding: 16 }}>
              <div className="eyebrow">vs hace 7 días</div>
              {segments.length >= 7 ? (() => {
                const now = segments[segments.length - 1].avg;
                const was = segments[Math.max(0, segments.length - 7)].avg;
                const delta = now - was;
                return (
                  <div className="num serif" style={{ fontSize: 36, lineHeight: 1, marginTop: 6, color: delta < 0 ? "var(--moss)" : "var(--clay)" }}>
                    {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                  </div>
                );
              })() : <div className="body-sm mt-6">Sin datos</div>}
            </div>
          </div>
        )}

        {/* SST spark */}
        {data?.sst && data.sst.length > 0 && (
          <>
            <div className="title-md serif mt-24">Test del balón · 5SST</div>
            <div className="card mt-12" style={{ padding: 18 }}>
              <div className="row between" style={{ alignItems: "center", marginBottom: 12 }}>
                <span className="eyebrow">fuerza percibida · últimas {data.sst.length} mediciones</span>
              </div>
              {/* Mini sparkline */}
              <div style={{ width: "100%", height: 48 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={[...data.sst].reverse()} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                    <Line
                      type="monotone"
                      dataKey="strength_score"
                      stroke="var(--moss)"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <XAxis dataKey="created_at" hide />
                    <YAxis domain={[0, 10]} hide />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="row between mt-4">
                <span className="body-sm">hace {data.sst.length} mediciones</span>
                <span className="body-sm">hoy</span>
              </div>
            </div>
          </>
        )}

        {/* Outcome — validated questionnaires (PROMs). Tap a card for the breakdown. */}
        {data && data.instruments.length > 0 && (
          <div className="title-md serif mt-24">Recuperación · cuestionarios</div>
        )}
        {data?.instruments.map((inst) => {
          const series = data.proms
            .filter((p) => p.instrument_id === inst.id)
            .map((p) => ({ date: p.date, score: p.score ?? 0 }))
            .reverse(); // getRecentProm is date-desc → chronological for the chart
          if (series.length === 0) return null;
          const current = series[series.length - 1].score;
          const prev = series.length >= 2 ? series[series.length - 2].score : null;
          const band = severityBand(inst, current);
          const trend = promTrend(inst, current, prev);
          return (
            <button
              key={inst.id}
              onClick={() => navigate(`/path/prom/${inst.id}`)}
              className="card mt-12"
              style={{ padding: 18, width: "100%", textAlign: "left", border: "none", cursor: "pointer", display: "block" }}
            >
              <div className="row between" style={{ alignItems: "center", marginBottom: 8 }}>
                <span className="body" style={{ fontWeight: 600 }}>{inst.name}</span>
                <Ico.arrow s={15} c="var(--ink-3)" />
              </div>
              <div className="row between" style={{ alignItems: "baseline" }}>
                <span className="row gap-8" style={{ alignItems: "baseline" }}>
                  <span className="num serif" style={{ fontSize: 36, color: "var(--ink)", lineHeight: 1 }}>
                    {current.toFixed(0)}
                  </span>
                  <span style={{
                    padding: "3px 9px", borderRadius: 999, background: band.tone,
                    color: "#fff", fontSize: 11, fontWeight: 700,
                  }}>{band.label}</span>
                </span>
                {trend.delta != null && (
                  <span className="num" style={{ fontSize: 14, color: trend.improving ? "var(--moss)" : "var(--clay)" }}>
                    {trend.delta > 0 ? "+" : ""}{trend.delta.toFixed(0)}{trend.mcid ? " ·rel" : ""}
                  </span>
                )}
              </div>
              {series.length > 1 && (
                <div style={{ width: "100%", height: 56, marginTop: 8 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke={inst.better_is_higher ? "var(--moss)" : "var(--clay)"}
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        isAnimationActive={false}
                      />
                      <XAxis dataKey="date" hide />
                      <YAxis domain={[0, 100]} hide />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function zoneLabel(key: string): string {
  const m: Record<string, string> = {
    cuello: "Cuello", ingleL: "Ingle izq",
    caderaL: "Cadera izq",
    pubis: "Pubis", hombroI: "Hombro izq", hombroD: "Hombro izq",
  };
  return m[key] ?? key;
}
