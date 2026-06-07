import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Ico } from "../components/icons";
import { COMMON_TIMEZONES, detectTimezone } from "../utils/timezone";
import { resetLocalCache } from "../../data/maintenance";
import { pushSupported, enableReminders, disableReminders, setReminderHour, getReminderPrefs } from "../../push";

export function ProfileScreen() {
  const { user, token, signOut, setTimezone } = useAuth();
  const navigate = useNavigate();
  const currentTz = user?.timezone || detectTimezone();
  const [selectedTz, setSelectedTz] = useState(currentTz);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  // Reminders (Web Push)
  const pushOk = pushSupported();
  const [remOn, setRemOn] = useState(false);
  const [remHour, setRemHour] = useState(8);
  const [remBusy, setRemBusy] = useState(false);
  const [remDenied, setRemDenied] = useState(false);

  useEffect(() => {
    if (!pushOk || !token) return;
    getReminderPrefs().then((p) => { setRemOn(p.enabled); setRemHour(p.hour); });
    if (typeof Notification !== "undefined" && Notification.permission === "denied") setRemDenied(true);
  }, [pushOk, token]);

  const handleToggleReminders = async () => {
    if (remBusy) return;
    setRemBusy(true);
    try {
      if (remOn) {
        await disableReminders();
        setRemOn(false);
      } else {
        const ok = await enableReminders(remHour);
        setRemOn(ok);
        if (!ok && typeof Notification !== "undefined" && Notification.permission === "denied") setRemDenied(true);
      }
    } finally {
      setRemBusy(false);
    }
  };

  const handleRemHourChange = async (h: number) => {
    setRemHour(h);
    if (remOn) await setReminderHour(h);
  };

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

  const handleResetCache = async () => {
    if (!token || resetting) return;
    setResetting(true);
    setResetDone(false);
    try {
      await resetLocalCache();
      setResetDone(true);
    } finally {
      setResetting(false);
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

        {/* Reminders */}
        {pushOk && (
          <div style={{ marginTop: 28 }}>
            <div className="row gap-6" style={{ marginBottom: 10, alignItems: "center" }}>
              <Ico.refresh s={14} c="var(--muted)" />
              <span className="eyebrow">Recordatorios</span>
            </div>
            <div className="card" style={{ padding: "14px 16px" }}>
              <div className="row between" style={{ alignItems: "center", gap: 12 }}>
                <div className="col gap-2" style={{ flex: 1 }}>
                  <span className="body" style={{ fontWeight: 600 }}>Aviso diario</span>
                  <span className="body-sm" style={{ color: "var(--ink-3)" }}>
                    Notificación en tus días de enfoque.
                  </span>
                </div>
                <button
                  onClick={handleToggleReminders}
                  disabled={remBusy}
                  aria-pressed={remOn}
                  style={{
                    width: 52, height: 30, flexShrink: 0, borderRadius: 999, border: "none",
                    background: remOn ? "var(--moss)" : "var(--line-2)",
                    position: "relative", cursor: remBusy ? "default" : "pointer",
                    opacity: remBusy ? 0.6 : 1, transition: "background 0.2s",
                  }}
                >
                  <span style={{
                    position: "absolute", top: 3, left: remOn ? 25 : 3, width: 24, height: 24,
                    borderRadius: 999, background: "#fff", transition: "left 0.2s",
                  }} />
                </button>
              </div>

              {remOn && (
                <div className="row between" style={{ alignItems: "center", marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                  <span className="body-sm" style={{ color: "var(--ink-3)" }}>Hora del aviso</span>
                  <select
                    value={remHour}
                    onChange={(e) => handleRemHourChange(Number(e.target.value))}
                    style={{
                      padding: "8px 10px", borderRadius: "var(--r-sm)", border: "1.5px solid var(--line-2)",
                      background: "var(--bg)", color: "var(--ink)", fontFamily: "var(--font-sans)",
                      fontSize: 13, fontWeight: 600, appearance: "none", WebkitAppearance: "none", cursor: "pointer",
                    }}
                  >
                    {Array.from({ length: 24 }).map((_, h) => (
                      <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                    ))}
                  </select>
                </div>
              )}

              {remDenied && (
                <div className="body-sm" style={{ marginTop: 10, color: "var(--clay)", lineHeight: 1.5 }}>
                  Permiso de notificaciones bloqueado. Actívalo en los ajustes del navegador.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Data */}
        <div style={{ marginTop: 28 }}>
          <div className="row gap-6" style={{ marginBottom: 10, alignItems: "center" }}>
            <span className="eyebrow">Datos</span>
          </div>
          <div className="card" style={{ padding: "6px 4px" }}>
            <button
              onClick={handleResetCache}
              disabled={resetting || !token}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 14px",
                background: "none",
                border: "none",
                cursor: resetting ? "default" : "pointer",
                color: "var(--ink)",
                fontFamily: "var(--font-sans)",
                fontSize: 15,
                fontWeight: 600,
                borderRadius: "var(--r-sm)",
                opacity: resetting ? 0.5 : 1,
              }}
            >
              <Ico.refresh s={18} c="var(--ink)" />
              {resetting ? "Sincronizando…" : "Borrar caché local"}
            </button>
            {resetDone && (
              <div className="row gap-6" style={{ padding: "0 14px 12px", color: "var(--moss)" }}>
                <Ico.check s={14} c="var(--moss)" />
                <span className="body-sm" style={{ color: "var(--moss)" }}>Caché actualizado desde el servidor</span>
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

        {/* Build stamp — para verificar qué versión cargó (útil en iOS PWA) */}
        <div className="body-sm" style={{ marginTop: 28, textAlign: "center", color: "var(--muted)", opacity: 0.6 }}>
          build {__BUILD__}
        </div>
      </div>

    </div>
  );
}
