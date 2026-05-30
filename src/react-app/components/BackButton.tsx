import { useNavigate, useLocation } from "react-router-dom";
import { Ico } from "./icons";

interface BackButtonProps {
  fallbackPath: string;
  color?: string;
  label?: string;
  onClick?: () => void;
}

export function BackButton({ fallbackPath, color = "var(--ink)", label, onClick }: BackButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleGoBack = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onClick) {
      onClick();
      return;
    }
    if (location.key === "default") {
      navigate(fallbackPath);
    } else {
      navigate(-1);
    }
  };

  return (
    <button
      onClick={handleGoBack}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
        height: 44,
        width: label ? undefined : 44,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        color: color,
        paddingRight: label ? 12 : 0,
        paddingLeft: label ? 10 : 0,
        borderRadius: 999,
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
      }}
      aria-label="Volver"
    >
      <Ico.chevL s={22} c={color} />
      {label && <span className="body-sm" style={{ color }}>{label}</span>}
    </button>
  );
}
