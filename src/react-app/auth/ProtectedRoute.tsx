import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "./AuthContext";
import { TabBar } from "../components/TabBar";

const TABBAR_ROOTS = ["/today", "/body", "/path", "/learn", "/profile"];

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

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

  const showTabBar = TABBAR_ROOTS.some((root) => location.pathname.startsWith(root));

  return (
    <>
      <AnimatePresence>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{ position: "absolute", inset: 0, minHeight: "100dvh" }}
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>
      {showTabBar && <TabBar />}
    </>
  );
}
