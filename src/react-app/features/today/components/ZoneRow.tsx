interface Props {
  name: string;
  value: number;
  max?: number;
  interactive?: boolean;
  compact?: boolean;
  onChange?: (v: number) => void;
}

export function ZoneRow({ name, value, max = 10, interactive, compact, onChange }: Props) {
  const pct = value / max;
  const tone = value >= 7 ? "var(--clay)" : value >= 4 ? "var(--sun)" : "var(--moss)";
  const toneRaw = value >= 7 ? "#D97757" : value >= 4 ? "#E8B85C" : "#8AA88C";

  return (
    <div className="row gap-10" style={{ alignItems: "center", padding: compact ? "1px 0" : "8px 0" }}>
      <div className="body-sm" style={{ width: compact ? 110 : 132, color: "var(--ink)", flexShrink: 0 }}>{name}</div>
      {interactive ? (
        <input
          type="range"
          min={0}
          max={max}
          value={value}
          onChange={(e) => onChange?.(Number(e.target.value))}
          className="zone-slider"
          style={{ "--zone-color": toneRaw } as React.CSSProperties}
        />
      ) : (
        <div className="bar" style={{ flex: 1, height: compact ? 4 : 8 }}>
          <div className="bar-fill" style={{ width: `${Math.max(4, pct * 100)}%`, background: tone }} />
        </div>
      )}
      <div className="num" style={{ width: compact ? 26 : 32, textAlign: "right", fontSize: compact ? 11 : 13, color: value > 0 ? tone : "var(--ink-3)", flexShrink: 0 }}>
        {value}/{max}
      </div>
    </div>
  );
}
