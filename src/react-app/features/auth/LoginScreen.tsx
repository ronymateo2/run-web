import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function LoginScreen() {
  const { user, loading, signingIn, GoogleSignInButton } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate("/today", { replace: true });
  }, [user, loading, navigate]);

  const busy = loading || signingIn;
  const busyLabel = signingIn ? "Iniciando sesión…" : "Preparando…";

  return (
    <div style={{
      minHeight: "100dvh", background: "var(--bg)", display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "0 32px",
    }}>
      {/* Logo */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, marginBottom: 56 }}>
        <svg width="64" height="64" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="14" fill="var(--ink)" />
          <path d="M16 26 V14" stroke="#EDE6D6" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M16 18 Q9 14 9 7 Q16 9 16 18" fill="#D97757" />
          <path d="M16 14 Q23 12 23 5 Q16 7 16 14" fill="#EDE6D6" opacity="0.85" />
        </svg>
        <div style={{ textAlign: "center" }}>
          <div className="serif" style={{ fontSize: 38, color: "var(--ink)", lineHeight: 1 }}>rurana</div>
          <div className="eyebrow" style={{ marginTop: 6 }}>tu rehabilitación, en tu mano</div>
        </div>
      </div>

      <div className="col gap-12" style={{ width: "100%", maxWidth: 320, alignItems: "center", minHeight: 80, justifyContent: "center" }}>
        {busy ? (
          <div className="col gap-12" style={{ alignItems: "center" }} aria-live="polite">
            <span
              aria-hidden
              style={{
                width: 22, height: 22, borderRadius: "50%",
                border: "2px solid var(--line, rgba(31,58,46,0.18))",
                borderTopColor: "var(--ink)",
                animation: "rurana-spin 0.8s linear infinite",
                display: "inline-block",
              }}
            />
            <span className="body-sm" style={{ opacity: 0.75 }}>{busyLabel}</span>
            <style>{`@keyframes rurana-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <>
            <GoogleSignInButton />
            <p className="body-sm" style={{ textAlign: "center", maxWidth: 260, lineHeight: 1.6 }}>
              Tus datos se sincronizan en la nube y se guardan sin conexión en tu dispositivo.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
