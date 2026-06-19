import { Navigate, Outlet, useLocation, useNavigationType } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { TabBar } from "@shared/components/TabBar";

const TABBAR_ROOTS = ["/today", "/body", "/path", "/learn", "/profile"];
const NO_TABBAR_PREFIXES = ["/today/exercise", "/today/checkin", "/today/sst"];

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navType = useNavigationType(); // "PUSH" | "POP" | "REPLACE"

  if (loading) {
    return (
      <div style={{
        minHeight: "100dvh", background: "var(--bg)", display: "flex",
        alignItems: "center", justifyContent: "center",
      }}>
        <svg width="48" height="48" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="14" fill="var(--ink)" />
          <path d="M16 26 V14" stroke="#EDE6D6" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M16 18 Q9 14 9 7 Q16 9 16 18" fill="#D97757" />
          <path d="M16 14 Q23 12 23 5 Q16 7 16 14" fill="#EDE6D6" opacity="0.85" />
        </svg>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const showTabBar = TABBAR_ROOTS.some((root) => location.pathname.startsWith(root))
    && !NO_TABBAR_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));

  // Tab switches cross-fade; drill-downs push in from the right; back pops in
  // from the left. CSS-only: the entering screen animates, the previous one
  // unmounts instantly (no JS spring running per frame — saves battery).
  const isTabRoot = TABBAR_ROOTS.includes(location.pathname);
  const animClass =
    navType === "POP" ? "screen-pop" : navType === "REPLACE" || isTabRoot ? "screen-fade" : "screen-push";

  return (
    <>
      {/* Clip layer: contains the sliding screen so the x-offset never leaks
          into a horizontal scroll on the body. The solid background covers the
          viewport while the entering screen slides over it. */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "var(--bg)" }}>
        <div
          key={location.pathname}
          className={`screen-anim ${animClass}`}
          style={{ position: "absolute", inset: 0, background: "var(--bg)" }}
        >
          <Outlet />
        </div>
      </div>
      {showTabBar && <TabBar />}
    </>
  );
}
