import { useNavigate, useLocation } from "react-router-dom";
import { Ico } from "./icons";

type Tab = "today" | "body" | "path" | "learn" | "profile";

const TABS: { id: Tab; label: string; path: string; icon: (active: boolean) => React.ReactElement }[] = [
  { id: "today", label: "Hoy", path: "/today", icon: (a) => <Ico.home s={20} c={a ? "var(--ink)" : "var(--muted)"} /> },
  { id: "body", label: "Cuerpo", path: "/body", icon: (a) => <Ico.body s={20} c={a ? "var(--ink)" : "var(--muted)"} /> },
  { id: "path", label: "Sendero", path: "/path", icon: (a) => <Ico.path s={20} c={a ? "var(--ink)" : "var(--muted)"} /> },
  { id: "learn", label: "Aprende", path: "/learn", icon: (a) => <Ico.book s={18} c={a ? "var(--ink)" : "var(--muted)"} /> },
  { id: "profile", label: "Perfil", path: "/profile", icon: (a) => <Ico.user s={20} c={a ? "var(--ink)" : "var(--muted)"} /> },
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
            <span className="tab-ico">{tab.icon(active)}</span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
