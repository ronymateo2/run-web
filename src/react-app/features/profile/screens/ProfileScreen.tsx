import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@features/auth/AuthContext";
import { Ico } from "@shared/components/icons";
import { COMMON_TIMEZONES, detectTimezone } from "@shared/utils/timezone";
import { resetLocalCache } from "@data/maintenance";
import { checkForUpdate } from "@app/pwa";
import {
  getSyncQueueStatus, retryFailedMutations, discardFailedMutations, pushDelta,
  type SyncQueueStatus,
} from "@data/sync";

export function ProfileScreen() {
  const { user, token, signOut, setTimezone } = useAuth();
  const navigate = useNavigate();
  const currentTz = user?.timezone || detectTimezone();
  const [selectedTz, setSelectedTz] = useState(currentTz);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [resetError, setResetError] = useState(false);

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

  // Outbox health: pending = waiting for the next push; failed = dead-lettered
  // (invalid or repeatedly rejected) and needs the user to retry or discard.
  const [queueStatus, setQueueStatus] = useState<SyncQueueStatus | null>(null);
  const [queueBusy, setQueueBusy] = useState(false);

  const refreshQueueStatus = () => {
    getSyncQueueStatus().then(setQueueStatus).catch(() => {});
  };
  useEffect(refreshQueueStatus, []);

  const handleRetryFailed = async () => {
    if (queueBusy) return;
    setQueueBusy(true);
    try {
      await retryFailedMutations();
      await pushDelta().catch(() => {});
      refreshQueueStatus();
    } finally {
      setQueueBusy(false);
    }
  };

  const handleDiscardFailed = async () => {
    if (queueBusy) return;
    if (!window.confirm("¿Descartar los cambios que no se pudieron sincronizar? Se perderán.")) return;
    setQueueBusy(true);
    try {
      await discardFailedMutations();
      refreshQueueStatus();
    } finally {
      setQueueBusy(false);
    }
  };

  const handleResetCache = async () => {
    if (!token || resetting) return;
    setResetting(true);
    setResetDone(false);
    setResetError(false);
    try {
      await resetLocalCache();
      setResetDone(true);
    } catch {
      // resetLocalCache pushes pending changes before wiping; offline/expired
      // session — or a queue that couldn't fully drain — aborts there with
      // local data intact.
      setResetError(true);
    } finally {
      setResetting(false);
      refreshQueueStatus();
    }
  };

  // Manual update check (replaces the old 60s auto-poll). "updating" → autoUpdate
  // reloads the page shortly; "current" → already latest.
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<"current" | "unsupported" | null>(null);

  const handleCheckUpdate = async () => {
    if (updating) return;
    setUpdating(true);
    setUpdateMsg(null);
    try {
      const result = await checkForUpdate();
      if (result === "updating") return; // page reloads itself
      setUpdateMsg(result);
    } finally {
      setUpdating(false);
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

        {/* Sync status: only visible when something is pending or dead-lettered */}
        {queueStatus && (queueStatus.pending > 0 || queueStatus.failed > 0) && (
          <div style={{ marginTop: 28 }}>
            <div className="row gap-6" style={{ marginBottom: 10, alignItems: "center" }}>
              <span className="eyebrow">Sincronización</span>
            </div>
            <div className="card" style={{ padding: "14px 16px" }}>
              {queueStatus.pending > 0 && (
                <div className="body-sm" style={{ lineHeight: 1.5 }}>
                  {queueStatus.pending} {queueStatus.pending === 1 ? "cambio pendiente" : "cambios pendientes"} de sincronizar.
                </div>
              )}
              {queueStatus.failed > 0 && (
                <>
                  <div className="body-sm" style={{ color: "var(--clay)", lineHeight: 1.5, marginTop: queueStatus.pending > 0 ? 8 : 0 }}>
                    {queueStatus.failed} {queueStatus.failed === 1 ? "cambio no se pudo" : "cambios no se pudieron"} sincronizar.
                  </div>
                  <div className="row gap-8" style={{ marginTop: 12 }}>
                    <button
                      className="btn-pill"
                      style={{ height: 40, fontSize: 13, flex: 1 }}
                      onClick={handleRetryFailed}
                      disabled={queueBusy}
                    >
                      {queueBusy ? "Reintentando…" : "Reintentar"}
                    </button>
                    <button
                      style={{
                        height: 40, fontSize: 13, flex: 1, background: "none",
                        border: "1.5px solid var(--line-2)", borderRadius: 999,
                        color: "var(--clay)", fontFamily: "var(--font-sans)",
                        fontWeight: 600, cursor: "pointer",
                      }}
                      onClick={handleDiscardFailed}
                      disabled={queueBusy}
                    >
                      Descartar
                    </button>
                  </div>
                </>
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
            {resetError && (
              <div className="body-sm" style={{ padding: "0 14px 12px", color: "var(--clay)", lineHeight: 1.5 }}>
                No se pudo sincronizar. Revisa tu conexión e intenta de nuevo.
              </div>
            )}
          </div>
        </div>

        {/* App / updates */}
        <div style={{ marginTop: 28 }}>
          <div className="row gap-6" style={{ marginBottom: 10, alignItems: "center" }}>
            <span className="eyebrow">Aplicación</span>
          </div>
          <div className="card" style={{ padding: "6px 4px" }}>
            <button
              onClick={handleCheckUpdate}
              disabled={updating}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 14px",
                background: "none",
                border: "none",
                cursor: updating ? "default" : "pointer",
                color: "var(--ink)",
                fontFamily: "var(--font-sans)",
                fontSize: 15,
                fontWeight: 600,
                borderRadius: "var(--r-sm)",
                opacity: updating ? 0.5 : 1,
              }}
            >
              <Ico.refresh s={18} c="var(--ink)" />
              {updating ? "Buscando…" : "Buscar actualización"}
            </button>
            {updateMsg === "current" && (
              <div className="row gap-6" style={{ padding: "0 14px 12px", color: "var(--moss)" }}>
                <Ico.check s={14} c="var(--moss)" />
                <span className="body-sm" style={{ color: "var(--moss)" }}>Ya tienes la última versión</span>
              </div>
            )}
            {updateMsg === "unsupported" && (
              <div className="body-sm" style={{ padding: "0 14px 12px", color: "var(--muted)", lineHeight: 1.5 }}>
                Actualizaciones no disponibles en este entorno.
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
