import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Ico } from "../components/icons";
import { COMMON_TIMEZONES, detectTimezone } from "../utils/timezone";

export function ProfileScreen() {
  const { user, signOut, setTimezone } = useAuth();
  const navigate = useNavigate();
  const currentTz = user?.timezone || detectTimezone();
  const [selectedTz, setSelectedTz] = useState(currentTz);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleTzChange = (tz: string) => {
    setSelectedTz(tz);
    setSaved(false);
  };

  const handleSaveTz = async () => {
    if (saving || selectedTz === user?.timezone) return;
    setSaving(true);
    try {
      await setTimezone(selectedTz);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const tzChanged = selectedTz !== (user?.timezone || detectTimezone());

  return (
    <div className="screen">
      <div className="screen-body" style={{ paddingBottom: 100, paddingTop: 4 }}>
        {/* Header */}
        <div className="col gap-4" style={{ paddingTop: 12 }}>
          <div className="eyebrow">Cuenta</div>
          <div className="title-lg serif">Perfil</div>
        </div>

        {/* Avatar + info */}
        <div
          className="card mt-20"
          style={{ padding: "20px 18px", display: "flex", alignItems: "center", gap: 14 }}
        >
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.name}
              style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              background: "var(--bg-2)", border: "1.5px solid var(--line-2)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Ico.user s={24} c="var(--muted)" />
            </div>
          )}
          <div className="col gap-4" style={{ minWidth: 0 }}>
            <div className="body" style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {user?.name ?? "—"}
            </div>
            <div className="body-sm" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {user?.email ?? "—"}
            </div>
          </div>
        </div>

        {/* Timezone */}
        <div style={{ marginTop: 28 }}>
          <div className="row gap-6" style={{ marginBottom: 10, alignItems: "center" }}>
            <Ico.globe s={14} c="var(--muted)" />
            <span className="eyebrow">Zona horaria</span>
          </div>
          <div className="card" style={{ padding: "14px 16px" }}>
            <div className="body-sm" style={{ marginBottom: 10, lineHeight: 1.5 }}>
              Usada para registrar la fecha correcta de tus ejercicios y check-ins.
            </div>
            <select
              value={selectedTz}
              onChange={(e) => handleTzChange(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "var(--r-sm)",
                border: "1.5px solid var(--line-2)",
                background: "var(--bg)",
                color: "var(--ink)",
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                fontWeight: 500,
                appearance: "none",
                WebkitAppearance: "none",
                cursor: "pointer",
              }}
            >
              {COMMON_TIMEZONES.map((group) => (
                <optgroup key={group.region} label={group.region}>
                  {group.zones.map((z) => (
                    <option key={z.value} value={z.value}>{z.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>

            {tzChanged && (
              <button
                className="btn-pill"
                style={{ marginTop: 12, height: 44, fontSize: 14 }}
                onClick={handleSaveTz}
                disabled={saving}
              >
                {saving ? "Guardando…" : "Guardar zona horaria"}
              </button>
            )}
            {saved && !tzChanged && (
              <div className="row gap-6" style={{ marginTop: 10, color: "var(--moss)" }}>
                <Ico.check s={14} c="var(--moss)" />
                <span className="body-sm" style={{ color: "var(--moss)" }}>Guardado</span>
              </div>
            )}
          </div>
        </div>

        {/* Session */}
        <div style={{ marginTop: 28 }}>
          <div className="row gap-6" style={{ marginBottom: 10, alignItems: "center" }}>
            <span className="eyebrow">Sesión</span>
          </div>
          <div className="card" style={{ padding: "6px 4px" }}>
            <button
              onClick={handleSignOut}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 14px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--clay)",
                fontFamily: "var(--font-sans)",
                fontSize: 15,
                fontWeight: 600,
                borderRadius: "var(--r-sm)",
              }}
            >
              <Ico.logout s={18} c="var(--clay)" />
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
