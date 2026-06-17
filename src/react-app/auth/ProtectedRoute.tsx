import { Navigate, Outlet, useLocation, useNavigationType } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "./AuthContext";
import { TabBar } from "../components/TabBar";

const TABBAR_ROOTS = ["/today", "/body", "/path", "/learn", "/profile"];
const NO_TABBAR_PREFIXES = ["/today/exercise", "/today/checkin", "/today/sst"];

// Native push/pop: forward nav slides in from the right, back from the left,
// replace cross-fades. `custom` carries the direction to the exiting screen too.
const screenVariants = {
  // Slide (dir != 0): screens move in/out over the full viewport width so the
  // previous screen never peeks through behind the entering one. Keeping opacity
  // at 1 avoids a light-background flash when leaving a dark screen.
  // Tab switch (dir 0): cross-fade.
  initial: (dir: number) => (dir === 0 ? { opacity: 0, x: 0 } : { opacity: 1, x: `${dir * 100}%` }),
  animate: { opacity: 1, x: 0 },
  exit: (dir: number) => (dir === 0 ? { opacity: 0, x: 0 } : { opacity: 1, x: `${dir * -100}%` }),
};

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

  // Tab switches cross-fade (dir 0); drill-downs push in; back pops out.
  const isTabRoot = TABBAR_ROOTS.includes(location.pathname);
  const dir = navType === "POP" ? -1 : navType === "REPLACE" || isTabRoot ? 0 : 1;

  return (
    <>
      {/* Clip layer: contains the sliding screens so the x-offset never
          leaks into a horizontal scroll on the body. The solid background
          covers any sub-pixel gap between the entering and exiting screens. */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "var(--bg)" }}>
        <AnimatePresence custom={dir}>
          <motion.div
            key={location.pathname}
            custom={dir}
            variants={screenVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ type: "spring", stiffness: 360, damping: 34, mass: 0.85, opacity: { duration: 0.18 } }}
            style={{ position: "absolute", inset: 0 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </div>
      {showTabBar && <TabBar />}
    </>
  );
}
