import { useNavigate, useLocation } from "react-router-dom";
import { Barbell, Person, Footprints, BookOpen, UserCircle } from "@phosphor-icons/react";

type Tab = "today" | "body" | "path" | "learn" | "profile";

const TABS: { id: Tab; label: string; path: string; icon: (active: boolean) => React.ReactElement }[] = [
  { id: "path", label: "Sendero", path: "/path", icon: (a) => <Footprints size={a ? 26 : 22} weight={a ? "fill" : "regular"} color={a ? "var(--ink)" : "var(--muted)"} /> },
  { id: "body", label: "Cuerpo", path: "/body", icon: (a) => <Person size={a ? 26 : 22} weight={a ? "fill" : "regular"} color={a ? "var(--ink)" : "var(--muted)"} /> },
  { id: "today", label: "Hoy", path: "/today", icon: (a) => <Barbell size={a ? 26 : 22} weight={a ? "fill" : "regular"} color={a ? "var(--ink)" : "var(--muted)"} /> },
  { id: "learn", label: "Aprende", path: "/learn", icon: (a) => <BookOpen size={a ? 26 : 22} weight={a ? "fill" : "regular"} color={a ? "var(--ink)" : "var(--muted)"} /> },
  { id: "profile", label: "Perfil", path: "/profile", icon: (a) => <UserCircle size={a ? 26 : 22} weight={a ? "fill" : "regular"} color={a ? "var(--ink)" : "var(--muted)"} /> },
];

export function TabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Active tab index. The pill indicator slides to it via a CSS transform
  // (compositor) — no JS layout animation per switch.
  const activeIndex = TABS.findIndex((tab) =>
    tab.id === "path"
      ? pathname.startsWith("/path") && !/\/edit$|\/phase\/new$/.test(pathname)
      : pathname.startsWith(tab.path)
  );

  return (
    <nav className="tab-bar">
      {activeIndex >= 0 && (
        <div className="tab-indicator" style={{ "--tab-index": activeIndex } as React.CSSProperties} />
      )}
      {TABS.map((tab, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={tab.id}
            className={`tab${active ? " is-active" : ""}`}
            onClick={() => navigate(tab.path)}
          >
            <span className="tab-ico">{tab.icon(active)}</span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
