import { useState } from "react";
import { Ico } from "./icons";
import { DaySession } from "../../db/queries/exercises";

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

  const label = first.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
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

  return (
    <div className="card mt-20" style={{ padding: "18px 20px 20px" }}>
      <div
        className="row between"
        style={{ marginBottom: 14, alignItems: "baseline" }}
      >
        <div className="eyebrow">Calendario</div>
        <div
          className="row"
          style={{ gap: 8, alignItems: "center" }}
        >
          <button
            onClick={prevMonth}
            style={{
              background: "transparent",
              border: "none",
              padding: 4,
              cursor: "pointer",
              color: "var(--ink)",
              display: "flex",
              alignItems: "center",
            }}
            aria-label="Mes anterior"
          >
            <Ico.chevL s={14} />
          </button>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--muted)",
              letterSpacing: "0.02em",
              textTransform: "capitalize",
              minWidth: 100,
              textAlign: "center",
            }}
          >
            {monthGrid.label}
          </span>
          <button
            onClick={nextMonth}
            style={{
              background: "transparent",
              border: "none",
              padding: 4,
              cursor: "pointer",
              color: "var(--ink)",
              display: "flex",
              alignItems: "center",
            }}
            aria-label="Mes siguiente"
          >
            <Ico.chevR s={14} />
          </button>
        </div>
      </div>

      {/* Single grid: weekdays + days aligned perfectly */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
        }}
      >
        {/* Weekday header */}
        {DAY_LABELS.map((label, i) => (
          <div
            key={`h-${i}`}
            style={{
              textAlign: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ink-3)",
              letterSpacing: "0.03em",
              marginBottom: 2,
            }}
          >
            {label}
          </div>
        ))}
        {monthGrid.cells.map((cell, idx) => {
          if (!cell.date) return <div key={idx} style={{ aspectRatio: "1", border: "1px solid transparent" }} />;
          const ph = phaseFor(cell.date);
          const badgeColor =
            ph !== null ? phaseColors[(ph - 1) % phaseColors.length] : null;
          return (
            <div
              key={cell.date}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (ph !== null && onDateClick) onDateClick(cell.date!);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && ph !== null && onDateClick) onDateClick(cell.date!);
              }}
              style={{
                position: "relative",
                aspectRatio: "1",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                borderRadius: 8,
                cursor: ph !== null && onDateClick ? "pointer" : "default",
                background: cell.isToday ? "var(--ink)" : "transparent",
                border: cell.isToday ? "none" : "1px solid var(--line)",
              }}
            >
              {/* F-badge */}
              <div style={{ minHeight: 12 }}>
                {ph !== null && badgeColor && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      lineHeight: 1,
                      padding: "2px 4px",
                      borderRadius: 4,
                      color: "#fff",
                      background: cell.isToday
                        ? "rgba(255,255,255,0.25)"
                        : badgeColor,
                    }}
                  >
                    F{ph}
                  </span>
                )}
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  fontWeight: cell.isToday ? 700 : 400,
                  color: cell.isToday
                    ? "#fff"
                    : ph !== null
                      ? "var(--ink)"
                      : "var(--ink-3)",
                }}
              >
                {cell.dayNum}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
