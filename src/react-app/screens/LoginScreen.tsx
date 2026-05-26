import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function LoginScreen() {
  const { user, loading, GoogleSignInButton } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate("/today", { replace: true });
  }, [user, loading, navigate]);

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

      <div className="col gap-12" style={{ width: "100%", maxWidth: 320, alignItems: "center" }}>
        <GoogleSignInButton />
        <p className="body-sm" style={{ textAlign: "center", maxWidth: 260, lineHeight: 1.6 }}>
          Tus datos se sincronizan en la nube y se guardan sin conexión en tu dispositivo.
        </p>
      </div>
    </div>
  );
}
