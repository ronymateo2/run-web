import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
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
  const [showFloating, setShowFloating] = useState(false);
  const inlineButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = inlineButtonRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show floating button when the inline button leaves the viewport
        setShowFloating(!entry.isIntersecting);
      },
      {
        root: null,
        threshold: 0,
        rootMargin: "-1px 0px 0px 0px",
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleGoBack = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onClick) {
      onClick();
      return;
    }
    // location.key is 'default' on the first loaded page of the session (e.g. on direct page refresh/load)
    if (location.key === "default") {
      navigate(fallbackPath);
    } else {
      navigate(-1);
    }
  };

  const isDark = color === "var(--bone)";

  return (
    <>
      <button
        ref={inlineButtonRef}
        onClick={handleGoBack}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          height: 44,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          color: color,
          marginLeft: -10, // Visual offset to align the icon perfectly with left margins
          paddingRight: label ? 12 : 10,
          paddingLeft: 10,
          borderRadius: 999,
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
        }}
        aria-label="Volver"
      >
        <Ico.chevL s={22} c={color} />
        {label && <span className="body-sm" style={{ color }}>{label}</span>}
      </button>

      {createPortal(
        <button
          onClick={handleGoBack}
          className={`back-btn-float${isDark ? " dark" : ""}${showFloating ? " is-visible" : ""}`}
          aria-label="Volver"
        >
          <Ico.chevL s={22} c={isDark ? "var(--bone)" : "var(--ink)"} />
        </button>,
        document.body
      )}
    </>
  );
}
