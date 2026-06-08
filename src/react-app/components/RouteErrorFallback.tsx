import { useRouteError, useNavigate } from "react-router-dom";

export function RouteErrorFallback() {
  const error = useRouteError();
  const navigate = useNavigate();
  const message = error instanceof Error ? error.message : "Error inesperado";

  return (
    <div style={styles.screen}>
      <div style={styles.content}>
        <div style={styles.icon}>!</div>
        <h1 style={styles.title}>Algo sali&oacute; mal</h1>
        <p style={styles.message}>
          Ocurri&oacute; un error en esta pantalla. Pod&eacute;s volver al inicio o intentar de nuevo.
        </p>
        <p style={styles.detail}>{message}</p>
        <div style={styles.actions}>
          <button style={styles.btnPrimary} onClick={() => navigate("/today")}>
            Volver al inicio
          </button>
          <button style={styles.btnGhost} onClick={() => window.location.reload()}>
            Intentar de nuevo
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: {
    height: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg)",
    fontFamily: "var(--font-sans)",
    color: "var(--ink)",
    padding: "24px",
  },
  content: {
    textAlign: "center" as const,
    maxWidth: 340,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: "var(--clay-soft)",
    color: "var(--clay-deep)",
    fontSize: 28,
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontFamily: "var(--font-serif)",
    fontSize: 28,
    fontWeight: 400,
    margin: "0 0 8px",
    letterSpacing: "-0.01em",
  },
  message: {
    fontSize: 15,
    lineHeight: 1.5,
    color: "var(--muted)",
    margin: "0 0 16px",
  },
  detail: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--clay)",
    background: "var(--card-soft)",
    borderRadius: 8,
    padding: "8px 12px",
    margin: "0 0 24px",
    wordBreak: "break-word" as const,
  },
  actions: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  btnPrimary: {
    height: 52,
    borderRadius: 999,
    background: "var(--ink)",
    color: "var(--bone)",
    fontFamily: "var(--font-sans)",
    fontSize: 15,
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
  },
  btnGhost: {
    height: 52,
    borderRadius: 999,
    background: "transparent",
    border: "1px solid var(--line-2)",
    color: "var(--ink)",
    fontFamily: "var(--font-sans)",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
};
