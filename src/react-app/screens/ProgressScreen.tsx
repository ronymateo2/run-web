import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useDb } from "../hooks/useDb";
import { Ico } from "../components/icons";
import { getRecentCheckins, type PainCheckin } from "../../db/queries/checkins";
import { getRecentSst, type SstResult } from "../../db/queries/sst";

const ZONE_COLORS: Record<string, string> = {
  ingleL: "rgba(217,119,87,0.7)", ingleR: "rgba(217,119,87,0.45)",
  caderaL: "rgba(58,82,109,0.6)", caderaR: "rgba(58,82,109,0.35)",
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
}

export function ProgressScreen() {
  const { user, lastSyncAt } = useAuth();
  const db = useDb();
  const navigate = useNavigate();
  const [data, setData] = useState<ProgressData | null>(null);

  useEffect(() => {
    if (!db || !user) return;
    let active = true;
    (async () => {
      const checkins = await getRecentCheckins(db, user.id, 30);
      const sst = await getRecentSst(db, user.id, 12);
      const segments = buildSegments(checkins);
      if (active) setData({ segments, sst });
    })();
    return () => { active = false; };
  }, [db, user, lastSyncAt]);

  const W = 340, H = 140;
  const segments = data?.segments ?? [];
  const n = segments.length;

  // Build SVG path for pain area chart
  function pathForZone(zone: string): string {
    if (!n) return "";
    const pts = segments.map((s, i) => {
      const x = (i / Math.max(1, n - 1)) * W;
      const y = H - ((s.zones[zone] ?? 0) / 10) * H;
      return [x, y] as [number, number];
    });
    const top = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(" ");
    return `${top} L${W},${H} L0,${H} Z`;
  }

  const activeZones = Object.keys(ZONE_COLORS).filter(k =>
    segments.some(s => (s.zones[k] ?? 0) > 0)
  );

  return (
    <div className="screen">
      <div className="screen-body" style={{ paddingBottom: 100 }}>
        {/* Header */}
        <div className="row between mt-4" style={{ alignItems: "center" }}>
          <button onClick={() => navigate("/path")} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <Ico.chevL s={22} c="var(--ink)" />
          </button>
          <div className="eyebrow">Progreso</div>
          <div style={{ width: 30 }} />
        </div>

        <div className="title-lg serif mt-12">La marea del dolor.</div>
        <div className="body-sm mt-4">Últimos 30 días · por zona.</div>

        {/* Pain area chart */}
        <div className="card mt-20" style={{ padding: 18, overflow: "hidden" }}>
          {n > 1 ? (
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
              {activeZones.map(zone => (
                <path key={zone} d={pathForZone(zone)} fill={ZONE_COLORS[zone] ?? "rgba(200,200,200,0.3)"} />
              ))}
            </svg>
          ) : (
            <div className="col" style={{ height: H, alignItems: "center", justifyContent: "center" }}>
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
              <svg width="100%" height={48} viewBox={`0 0 ${W} 48`} preserveAspectRatio="none">
                <polyline
                  points={[...data.sst].reverse().map((r, i) => {
                    const x = (i / Math.max(1, data.sst.length - 1)) * W;
                    const y = 48 - ((r.strength_score ?? 0) / 10) * 44;
                    return `${x},${y}`;
                  }).join(" ")}
                  fill="none"
                  stroke="var(--moss)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div className="row between mt-4">
                <span className="body-sm">hace {data.sst.length} mediciones</span>
                <span className="body-sm">hoy</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function zoneLabel(key: string): string {
  const m: Record<string, string> = {
    ingleL: "Ingle izq", ingleR: "Ingle der",
    caderaL: "Cadera izq", caderaR: "Cadera der",
    pubis: "Pubis", hombroI: "Hombro izq", hombroD: "Hombro izq",
  };
  return m[key] ?? key;
}
