import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { localToday } from "../utils/timezone";
import { useDb } from "../hooks/useDb";
import { BodyFigure, type HeatMap } from "../components/BodyFigure";
import { NudgeSST } from "../components/NudgeSST";
import { Ico } from "../components/icons";
import { getActiveInjuries, getCurrentPhase, type Injury, type Phase } from "../../db/queries/injuries";
import { getRecentCheckins, type PainCheckin } from "../../db/queries/checkins";
import { getTodaySst, isSstPreferredToday, type SstResult } from "../../db/queries/sst";


function avgZones(checkins: PainCheckin[]): HeatMap {
  if (!checkins.length) return {};
  const totals: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const c of checkins) {
    for (const [k, v] of Object.entries(c.zones)) {
      if (v === undefined) continue;
      totals[k] = (totals[k] ?? 0) + v;
      counts[k] = (counts[k] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.keys(totals).map(k => [k, totals[k] / counts[k]])) as HeatMap;
}

function zoneLabel(key: string): string {
  const m: Record<string, string> = {
    ingleL: "Ingle izquierda", ingleR: "Ingle derecha",
    caderaL: "Cadera izquierda", caderaR: "Cadera derecha",
    pubis: "Pubis", hombroD: "Hombro derecho", lumbar: "Lumbar",
  };
  return m[key] ?? key;
}

function trend(recent: number[], older: number[]): "↓" | "↑" | "→" {
  const r = recent.reduce((a, b) => a + b, 0) / (recent.length || 1);
  const o = older.reduce((a, b) => a + b, 0) / (older.length || 1);
  if (r < o - 0.3) return "↓";
  if (r > o + 0.3) return "↑";
  return "→";
}

interface ZoneStat {
  key: string;
  label: string;
  current: number;
  trendArrow: "↓" | "↑" | "→";
}

interface InjuryWithPhase {
  injury: Injury;
  phase: Phase | null;
}

interface CuerpoData {
  injuriesWithPhase: InjuryWithPhase[];
  heatAvg: HeatMap;
  zoneStats: ZoneStat[];
  sstResult: SstResult | null;
  sstDue: boolean;
}

export function CuerpoScreen() {
  const { user } = useAuth();
  const db = useDb();
  const navigate = useNavigate();
  const [data, setData] = useState<CuerpoData | null>(null);

  useEffect(() => {
    if (!db || !user) return;
    let active = true;
    (async () => {
      const dateStr = localToday(user?.timezone);
      const injuries = await getActiveInjuries(db, user.id);
      const injuriesWithPhase: InjuryWithPhase[] = await Promise.all(
        injuries.map(async (inj) => ({ injury: inj, phase: await getCurrentPhase(db, inj) }))
      );
      const recentCheckins = await getRecentCheckins(db, user.id, 14);
      const heatAvg = avgZones(recentCheckins);
      const sstResult = await getTodaySst(db, user.id, dateStr);
      const sstDue = isSstPreferredToday(user?.timezone);

      const zoneKeys = ["ingleL", "ingleR", "caderaL", "caderaR", "pubis", "hombroD", "lumbar"] as const;
      const activeZones = zoneKeys.filter(k => (heatAvg[k] ?? 0) > 0);
      const recentHalf = recentCheckins.slice(0, 7);
      const olderHalf = recentCheckins.slice(7, 14);

      const zoneStats: ZoneStat[] = activeZones.map(k => ({
        key: k,
        label: zoneLabel(k),
        current: recentHalf.length ? recentHalf.reduce((a, c) => a + (c.zones[k] ?? 0), 0) / recentHalf.length : 0,
        trendArrow: trend(
          recentHalf.map(c => c.zones[k] ?? 0),
          olderHalf.map(c => c.zones[k] ?? 0),
        ),
      })).sort((a, b) => b.current - a.current);

      if (active) setData({ injuriesWithPhase, heatAvg, zoneStats, sstResult, sstDue });
    })();
    return () => { active = false; };
  }, [db, user]);

  const sstState = !data?.sstDue ? "hidden" : data?.sstResult ? "done" : "pending";

  return (
    <div className="screen">
      <div className="screen-body" style={{ paddingBottom: 100 }}>
        {/* Header */}
        <div className="col gap-4 mt-4">
          <div className="eyebrow">Tu mapa</div>
          <div className="title-lg serif">Tu cuerpo, hoy.</div>
        </div>

        {/* Injuries (dual injury view) */}
        {data?.injuriesWithPhase && data.injuriesWithPhase.length >= 2 ? (
          <div className="col gap-12 mt-20">
            {data.injuriesWithPhase.map(({ injury: inj, phase }) => (
              <div key={inj.id} className="card" style={{ padding: 18 }}>
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <div className="col gap-4" style={{ flex: 1 }}>
                    <div className="eyebrow">{inj.zone}</div>
                    <div className="title-md serif">{inj.name}</div>
                    {phase && (
                      <div className="body-sm" style={{ marginTop: 2 }}>
                        {phase.name} · semana {phase.week_start}–{phase.week_end}
                      </div>
                    )}
                    <span className="chip mt-4" style={{
                      background: inj.status === "active" ? "rgba(138,168,140,0.15)" : "rgba(217,119,87,0.1)",
                      color: inj.status === "active" ? "var(--moss)" : "var(--clay-deep)",
                      border: "none", alignSelf: "flex-start",
                    }}>
                      {inj.status === "active" ? "Activa" : inj.status === "paused" ? "En pausa" : "Completada"}
                    </span>
                  </div>
                  <button
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
                    onClick={() => navigate(`/path`)}
                  >
                    <Ico.chevR s={18} c="var(--muted)" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Single injury + body figure
          <div className="card mt-20" style={{ padding: 18 }}>
            <div className="row between" style={{ alignItems: "flex-start" }}>
              <div className="col gap-4" style={{ flex: 1 }}>
                <div className="eyebrow">mapa de calor · últimos 7 días</div>
                <div className="title-md serif">La marea baja.</div>
                {data?.zoneStats && data.zoneStats.length > 0 && (
                  <div className="body-sm mt-4" style={{ color: "var(--ink-3)" }}>
                    {data.zoneStats.filter(z => z.trendArrow === "↓").length} zonas bajando
                  </div>
                )}
              </div>
              <div className="drift">
                <BodyFigure w={96} heat={data?.heatAvg} />
              </div>
            </div>
          </div>
        )}

        {/* Zone list */}
        {data?.zoneStats && data.zoneStats.length > 0 && (
          <>
            <div className="title-md serif mt-24">Zonas activas</div>
            <div className="col gap-10 mt-12">
              {data.zoneStats.map(z => (
                <div key={z.key} className="card" style={{ padding: 14 }}>
                  <div className="row between" style={{ alignItems: "center" }}>
                    <div className="col gap-2" style={{ flex: 1 }}>
                      <div className="row gap-8" style={{ alignItems: "center" }}>
                        <div style={{
                          width: 10, height: 10, borderRadius: 999,
                          background: z.current >= 5 ? "var(--clay)" : z.current >= 3 ? "var(--sun)" : "var(--moss)",
                          boxShadow: `0 0 6px ${z.current >= 5 ? "var(--clay)" : z.current >= 3 ? "var(--sun)" : "var(--moss)"}`,
                        }} />
                        <span className="body" style={{ fontWeight: 600 }}>{z.label}</span>
                      </div>
                    </div>
                    <div className="row gap-12" style={{ alignItems: "center" }}>
                      <span style={{ fontSize: 18, color: z.trendArrow === "↓" ? "var(--moss)" : z.trendArrow === "↑" ? "var(--clay)" : "var(--muted)" }}>
                        {z.trendArrow}
                      </span>
                      <div className="num serif" style={{ fontSize: 28, color: "var(--ink)", lineHeight: 1 }}>
                        {z.current.toFixed(1)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 5SST card */}
        <NudgeSST state={sstState} lastScore={data?.sstResult?.pain_score ?? undefined} />
      </div>

    </div>
  );
}
