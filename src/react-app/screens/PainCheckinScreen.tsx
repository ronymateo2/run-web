import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { localToday } from "../utils/timezone";
import { useDb } from "../hooks/useDb";
import { useSync } from "../hooks/useSync";
import { BodyFigure, type HeatMap } from "../components/BodyFigure";
import { ZoneRow } from "../components/ZoneRow";
import { Ico } from "../components/icons";
import { BackButton } from "../components/BackButton";
import { ScreenNav } from "../components/ScreenNav";
import { saveCheckin, getTodayCheckin } from "../../db/queries/checkins";

const ZONES: { key: keyof HeatMap; label: string }[] = [
  { key: "ingleL", label: "Ingle izquierda" },
  { key: "ingleR", label: "Ingle derecha" },
  { key: "caderaL", label: "Cadera izquierda" },
  { key: "caderaR", label: "Cadera derecha" },
  { key: "pubis", label: "Pubis" },
  { key: "hombroI", label: "Hombro izquierdo" },
  { key: "lumbar", label: "Lumbar" },
];

export function PainCheckinScreen() {
  const { user } = useAuth();
  const db = useDb();
  const push = useSync();
  const navigate = useNavigate();
  const [zones, setZones] = useState<HeatMap>({
    ingleL: 0, ingleR: 0, caderaL: 0, caderaR: 0, pubis: 0, hombroI: 0, lumbar: 0,
  });

  function updateZone(key: keyof HeatMap, value: number) {
    setZones(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!db || !user) return;
    const dateStr = localToday(user?.timezone);
    const existing = await getTodayCheckin(db, user.id, dateStr);
    await saveCheckin(db, {
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
