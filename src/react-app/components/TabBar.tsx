import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, useAnimate } from "motion/react";
import { Barbell, Person, Footprints, BookOpen, UserCircle } from "@phosphor-icons/react";

type Tab = "today" | "body" | "path" | "learn" | "profile";

const TABS: { id: Tab; label: string; path: string; icon: (active: boolean) => React.ReactElement }[] = [
  { id: "path", label: "Sendero", path: "/path", icon: (a) => <Footprints size={22} weight={a ? "fill" : "regular"} color={a ? "var(--ink)" : "var(--muted)"} /> },
  { id: "body", label: "Cuerpo", path: "/body", icon: (a) => <Person size={22} weight={a ? "fill" : "regular"} color={a ? "var(--ink)" : "var(--muted)"} /> },
  { id: "today", label: "Hoy", path: "/today", icon: (a) => <Barbell size={22} weight={a ? "fill" : "regular"} color={a ? "var(--ink)" : "var(--muted)"} /> },
  { id: "learn", label: "Aprende", path: "/learn", icon: (a) => <BookOpen size={22} weight={a ? "fill" : "regular"} color={a ? "var(--ink)" : "var(--muted)"} /> },
  { id: "profile", label: "Perfil", path: "/profile", icon: (a) => <UserCircle size={22} weight={a ? "fill" : "regular"} color={a ? "var(--ink)" : "var(--muted)"} /> },
];

export function TabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [scope, animate] = useAnimate();
  const firstRender = useRef(true);

  const activeId: Tab | null = (() => {
    for (const tab of TABS) {
      const isActive = tab.id === "path"
        ? pathname.startsWith("/path") && !/\/edit$|\/phase\/new$/.test(pathname)
        : pathname.startsWith(tab.path);
      if (isActive) return tab.id;
    }
    return null;
  })();

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!activeId || !scope.current) return;
    animate(
      scope.current,
      { scale: [1, 1.07, 1] },
      { duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }
    );
  }, [activeId, animate, scope]);

  return (
    <motion.nav ref={scope} className="tab-bar">
      {TABS.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            className={`tab${active ? " is-active" : ""}`}
            onClick={() => navigate(tab.path)}
          >
            {active && (
              <motion.div
                layoutId="tab-indicator"
                className="tab-indicator"
                transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.9 }}
              />
            )}
            <span className="tab-ico">{tab.icon(active)}</span>
            {tab.label}
          </button>
        );
      })}
    </motion.nav>
  );
}
