interface Props {
  name: string;
  value: number;
  max?: number;
  interactive?: boolean;
  onChange?: (v: number) => void;
}

export function ZoneRow({ name, value, max = 10, interactive, onChange }: Props) {
  const pct = value / max;
  const tone = value >= 5 ? "var(--clay)" : value >= 3 ? "var(--sun)" : "var(--moss)";
  return (
    <div className="row gap-10" style={{ alignItems: "center" }}>
      <div className="body-sm" style={{ width: 132, color: "var(--ink)" }}>{name}</div>
      {interactive ? (
        <input
          type="range" min={0} max={max} value={value}
          onChange={(e) => onChange?.(Number(e.target.value))}
          style={{ flex: 1, accentColor: tone, height: 6 }}
        />
      ) : (
        <div className="bar" style={{ flex: 1 }}>
          <div className="bar-fill" style={{ width: `${Math.max(4, pct * 100)}%`, background: tone }} />
        </div>
      )}
      <div className="num" style={{ width: 32, textAlign: "right", fontSize: 13, color: "var(--ink-3)" }}>
        {value}/{max}
      </div>
    </div>
  );
}
