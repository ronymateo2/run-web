import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback({ error: this.state.error, reset: this.reset });
      }
      return <DefaultErrorFallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

function DefaultErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={styles.screen}>
      <div style={styles.content}>
        <div style={styles.icon}>!</div>
        <h1 style={styles.title}>Algo sali&oacute; mal</h1>
        <p style={styles.message}>
          Ocurri&oacute; un error inesperado. Pod&eacute;s volver al inicio o intentar de nuevo.
        </p>
        <p style={styles.detail}>{error.message}</p>
        <div style={styles.actions}>
          <button style={styles.btnPrimary} onClick={goHome}>
            Volver al inicio
          </button>
          <button style={styles.btnGhost} onClick={reset}>
            Intentar de nuevo
          </button>
        </div>
      </div>
    </div>
  );
}

function goHome() {
  window.location.href = "/";
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
