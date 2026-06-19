import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@features/auth/AuthContext";
import { localToday } from "@shared/utils/timezone";
import { useSync } from "@shared/hooks/useSync";
import { BodyFigure, type HeatMap } from "@shared/components/BodyFigure";
import { ZoneRow } from "../components/ZoneRow";
import { Ico } from "@shared/components/icons";
import { BackButton } from "@shared/components/BackButton";
import { ScreenNav } from "@shared/components/ScreenNav";
import { checkinRepository } from "@data/repositories";

const ZONES: { key: keyof HeatMap; label: string }[] = [
  { key: "cuello", label: "Cuello" },
  { key: "ingleL", label: "Ingle izquierda" },
  { key: "caderaL", label: "Cadera izquierda" },
  { key: "pubis", label: "Pubis" },
  { key: "hombroI", label: "Hombro izquierdo" },
  { key: "lumbar", label: "Lumbar" },
];

export function PainCheckinScreen() {
  const { user } = useAuth();
  const push = useSync();
  const navigate = useNavigate();
  const [zones, setZones] = useState<HeatMap>({
    cuello: 0, ingleL: 0, caderaL: 0, pubis: 0, hombroI: 0, lumbar: 0,
  });

  function updateZone(key: keyof HeatMap, value: number) {
    setZones(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!user) return;
    const dateStr = localToday(user?.timezone);
    const existing = await checkinRepository.getTodayCheckin(user.id, dateStr);
    await checkinRepository.saveCheckin({
      id: existing?.id ?? crypto.randomUUID(),
      user_id: user.id,
      date: dateStr,
      zones,
      created_at: existing?.created_at ?? Date.now(),
    });
    push();
    navigate("/today", { replace: true });
  }

  return (
    <div className="screen">
      <ScreenNav back={<BackButton fallbackPath="/today" color="var(--ink)" />}>
        <div className="eyebrow">Check-in de dolor</div>
        <div style={{ width: 34 }} />
      </ScreenNav>
      <div className="screen-body" style={{ paddingBottom: 100 }}>

        <div className="title-lg serif mt-16">
          ¿Cómo sientes el cuerpo hoy?
        </div>
        <div className="body-sm mt-4">
          Escala del 0 al 10 — 0 es sin dolor, 10 es insoportable.
        </div>

        {/* Body figure */}
        <div style={{ display: "flex", justifyContent: "center", margin: "12px 0 4px" }}>
          <BodyFigure w={300} heat={zones} onTap={(zone) => updateZone(zone, Math.min(10, (zones[zone] ?? 0) + 1))} />
        </div>

        {/* Zone sliders */}
        <div className="card" style={{ padding: "4px 18px 8px" }}>
          {ZONES.map(({ key, label }) => (
            <ZoneRow
              key={key}
              name={label}
              value={zones[key] ?? 0}
              interactive
              compact
              onChange={(v) => updateZone(key, v)}
            />
          ))}
        </div>

        <div style={{ marginTop: 24 }}>
          <button className="btn-pill" onClick={handleSave}>
            Guardar check-in <Ico.check s={16} c="#EDE6D6" />
          </button>
        </div>
      </div>
    </div>
  );
}
