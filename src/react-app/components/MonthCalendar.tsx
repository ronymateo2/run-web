import { useState, type CSSProperties } from "react";
import { Ico } from "./icons";
import type { DaySession } from "../../data/repositories";

interface MonthCalendarProps {
  sessionsByDate: Map<string, DaySession[]>;
  phaseColors: string[];
  timezone?: string | null;
  injuryId?: string | null;
  onDateClick?: (date: string) => void;
}

interface MonthCell {
  date: string | null;
  dayNum: number;
  isToday: boolean;
}

interface MonthGrid {
  label: string;
  cells: MonthCell[];
}

const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

const navBtnStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 999,
  background: "var(--card-soft)",
  border: "1px solid var(--line)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  color: "var(--ink)",
  padding: 0,
};

function localToday(tz?: string | null): string {
  if (tz) {
    try {
      const d = new Date().toLocaleDateString("en-CA", { timeZone: tz });
      return d;
    } catch {
      // fall through
    }
  }
  return new Date().toLocaleDateString("en-CA");
}

function getMonthGrid(year: number, month: number, tz?: string | null): MonthGrid {
  const today = localToday(tz);
  const first = new Date(year, month, 1, 12);
  const dow = first.getDay(); // 0 = Sun
  const lead = dow === 0 ? 6 : dow - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: MonthCell[] = [];
  for (let i = 0; i < lead; i++) {
    cells.push({ date: null, dayNum: 0, isToday: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d, 12).toLocaleDateString("en-CA");
    cells.push({ date, dayNum: d, isToday: date === today });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, dayNum: 0, isToday: false });
  }

  const raw = first.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const label = raw.charAt(0).toUpperCase() + raw.slice(1);
  return { label, cells };
}

export function MonthCalendar({
  sessionsByDate,
  phaseColors,
  timezone,
  injuryId,
  onDateClick,
}: MonthCalendarProps) {
  const [viewDate, setViewDate] = useState(new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthGrid = getMonthGrid(year, month, timezone);

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const phaseFor = (date: string | null): number | null => {
    if (!date) return null;
    let sessions = sessionsByDate.get(date) ?? [];
    if (injuryId) {
      sessions = sessions.filter((s) => s.injury_id === injuryId);
    }
    if (!sessions.length) return null;
    return Math.max(...sessions.map((s) => s.phase_num));
  };

  const phasesInMonth = Array.from(
    new Set(
      monthGrid.cells
        .map((c) => phaseFor(c.date))
        .filter((p): p is number => p !== null)
    )
  ).sort((a, b) => a - b);

  return (
    <div className="card rise rise-3" style={{ marginTop: 22, padding: "20px 18px 16px" }}>
      <div className="row between" style={{ marginBottom: 14, alignItems: "center" }}>
        <span
          className="serif"
          style={{ fontSize: 21, letterSpacing: "-0.01em", color: "var(--ink)" }}
        >
          {monthGrid.label}
        </span>
        <div className="row" style={{ gap: 6 }}>
          <button onClick={prevMonth} style={navBtnStyle} aria-label="Mes anterior">
            <Ico.chevL s={13} />
          </button>
          <button onClick={nextMonth} style={navBtnStyle} aria-label="Mes siguiente">
            <Ico.chevR s={13} />
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          rowGap: 4,
        }}
      >
        {/* Weekday header */}
        {DAY_LABELS.map((label, i) => (
          <div
            key={`h-${i}`}
            style={{
              textAlign: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--faint)",
              letterSpacing: "0.08em",
              marginBottom: 4,
            }}
          >
            {label}
          </div>
        ))}
        {monthGrid.cells.map((cell, idx) => {
          if (!cell.date) return <div key={idx} style={{ aspectRatio: "1" }} />;
          const ph = phaseFor(cell.date);
          const color = ph !== null ? phaseColors[(ph - 1) % phaseColors.length] : null;
          const clickable = ph !== null && !!onDateClick;
          return (
            <div
              key={cell.date}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={() => {
                if (clickable) onDateClick!(cell.date!);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && clickable) onDateClick!(cell.date!);
              }}
              style={{
                aspectRatio: "1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: clickable ? "pointer" : "default",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: color ?? (cell.isToday ? "var(--ink)" : "transparent"),
                  boxShadow:
                    cell.isToday && color
                      ? "0 0 0 2px var(--card), 0 0 0 3.5px var(--ink)"
                      : "none",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    fontWeight: cell.isToday || ph !== null ? 700 : 400,
                    color: ph !== null || cell.isToday ? "#fff" : "var(--ink-3)",
                  }}
                >
                  {cell.dayNum}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {phasesInMonth.length > 0 && (
        <div
          className="row"
          style={{
            gap: 14,
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid var(--line)",
            flexWrap: "wrap",
          }}
        >
          {phasesInMonth.map((p) => (
            <span
              key={p}
              className="row"
              style={{
                gap: 6,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--muted)",
                letterSpacing: "0.06em",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: phaseColors[(p - 1) % phaseColors.length],
                }}
              />
              FASE {p}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
