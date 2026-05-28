import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "motion/react";
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

  return (
    <nav className="tab-bar">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.path);
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
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <span className="tab-ico">{tab.icon(active)}</span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
