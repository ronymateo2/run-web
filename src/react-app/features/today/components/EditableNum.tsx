// Tap-to-edit numeric cell used in the set-card metrics (reps/time, RPE). Shows a
// mono number; on tap swaps to a clamped numeric input that commits on blur/Enter.
import { useState, useEffect, useRef } from "react";

export function EditableNum({
  value, min, max, completed, onChange, suffix, size = 22,
}: {
  value: number;
  min: number;
  max: number;
  completed: boolean;
  onChange: (v: number) => void;
  suffix?: string;
  size?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setLocal(String(value));
  }, [value, editing]);

  function open() {
    setEditing(true);
  }

  function commit() {
    const n = parseInt(local, 10);
    if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
        <input
          ref={inputRef}
          autoFocus
          type="number"
          inputMode="numeric"
          value={local}
          onChange={e => setLocal(e.target.value)}
          onFocus={e => e.target.select()}
          onBlur={commit}
          onKeyDown={e => e.key === "Enter" && commit()}
          style={{
            width: Math.max(56, size * 2.6),
            background: "rgba(245,240,232,0.10)",
            border: "1.5px solid rgba(245,240,232,0.30)",
            borderRadius: 8,
            color: "var(--bone)",
            fontFamily: "var(--font-mono)",
            fontSize: size - 2,
            fontWeight: 600,
            textAlign: "center",
            padding: "4px 2px",
            outline: "none",
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{ display: "flex", justifyContent: "center", alignItems: "center", cursor: "pointer" }}
      onClick={open}
    >
      <span style={{
        fontFamily: "var(--font-mono)",
        fontWeight: 600,
        fontSize: size,
        color: completed ? "rgba(245,240,232,0.97)" : "rgba(245,240,232,0.55)",
        transition: "color 0.25s",
        display: "flex",
        alignItems: "baseline",
        gap: 2,
      }}>
        {value}
        {suffix && (
          <span style={{ fontSize: Math.round(size * 0.6), fontWeight: 400, opacity: 0.65 }}>{suffix}</span>
        )}
      </span>
    </div>
  );
}
