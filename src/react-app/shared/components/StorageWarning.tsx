// Degraded-storage banner: shown when SQLite fell back to in-memory (OPFS
// unavailable — e.g. private browsing). Without this the user writes data that
// silently dies on reload. Sync still works, so pushed rows do survive.
import { useEffect, useState } from "react";
import { isStoragePersistent } from "../../db/client";

export function StorageWarning() {
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isStoragePersistent()
      .then((persistent) => {
        if (!cancelled && !persistent) setDegraded(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!degraded) return null;
  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        padding: "8px 14px",
        background: "var(--clay)",
        color: "var(--bone)",
        fontFamily: "var(--font-sans)",
        fontSize: 12.5,
        fontWeight: 600,
        textAlign: "center",
        lineHeight: 1.4,
      }}
    >
      Almacenamiento local no disponible: tus datos solo se guardan al sincronizar.
      Evita cerrar la app sin conexión.
    </div>
  );
}
