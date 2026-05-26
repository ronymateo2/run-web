export interface HeatMap extends Record<string, number | undefined> {
  hombroD?: number; pubis?: number; ingleL?: number; ingleR?: number;
  caderaL?: number; caderaR?: number; lumbar?: number;
}

interface Props {
  heat?: HeatMap;
  w?: number;
  onTap?: (zone: keyof HeatMap) => void;
}

function heatColor(v?: number): string {
  if (!v) return "transparent";
  const t = Math.min(1, v / 10);
  return `rgba(217, 119, 87, ${0.18 + 0.65 * t})`;
}

export function BodyFigure({ heat = {}, w = 220, onTap }: Props) {
  const z = (id: keyof HeatMap, el: React.ReactElement) => (
    <g key={id} onClick={() => onTap?.(id)} style={{ cursor: onTap ? "pointer" : "default" }}>
      {el}
    </g>
  );

  return (
    <svg
      width={w}
      viewBox="0 0 200 360"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{ display: "block" }}
    >
      <ellipse cx="100" cy="350" rx="62" ry="6" fill="rgba(31,58,46,0.10)" />
      {/* head */}
      <circle cx="100" cy="34" r="24" fill="#EDE6D6" />
      {/* neck */}
      <rect x="92" y="56" width="16" height="14" rx="4" fill="#EDE6D6" />
      {/* torso */}
      <path d="M62 78 Q70 70 100 70 Q130 70 138 78 L142 150 Q142 178 130 196 L70 196 Q58 178 58 150 Z" fill="#EDE6D6" />
      {/* arms */}
      <path d="M62 80 Q44 90 40 130 L46 200 Q50 218 54 220 L62 220 Q60 200 60 180 L66 140 Q66 100 70 88 Z" fill="#EDE6D6" />
      <path d="M138 80 Q156 90 160 130 L154 200 Q150 218 146 220 L138 220 Q140 200 140 180 L134 140 Q134 100 130 88 Z" fill="#EDE6D6" />
      {/* pelvis */}
      <path d="M68 196 L132 196 L138 230 Q120 244 100 244 Q80 244 62 230 Z" fill="#EDE6D6" />
      {/* legs */}
      <path d="M72 232 Q70 280 76 330 Q82 348 92 348 Q98 346 98 330 L100 244 Z" fill="#EDE6D6" />
      <path d="M128 232 Q130 280 124 330 Q118 348 108 348 Q102 346 102 330 L100 244 Z" fill="#EDE6D6" />

      {/* heat zones */}
      {z("hombroD", <ellipse cx="62" cy="86" rx="14" ry="11" fill={heatColor(heat.hombroD)} />)}
      {z("pubis", <ellipse cx="100" cy="216" rx="14" ry="8" fill={heatColor(heat.pubis)} />)}
      {z("ingleL", <ellipse cx="86" cy="232" rx="11" ry="9" fill={heatColor(heat.ingleL)} />)}
      {z("ingleR", <ellipse cx="114" cy="232" rx="11" ry="9" fill={heatColor(heat.ingleR)} />)}
      {z("caderaL", <ellipse cx="74" cy="220" rx="13" ry="13" fill={heatColor(heat.caderaL)} />)}
      {z("caderaR", <ellipse cx="126" cy="220" rx="13" ry="13" fill={heatColor(heat.caderaR)} />)}

      {/* outline */}
      <g fill="none" stroke="rgba(31,58,46,0.35)" strokeWidth="1.2" strokeLinejoin="round">
        <circle cx="100" cy="34" r="24" />
        <path d="M62 78 Q70 70 100 70 Q130 70 138 78 L142 150 Q142 178 130 196 L70 196 Q58 178 58 150 Z" />
        <path d="M62 80 Q44 90 40 130 L46 200 Q50 218 54 220 L62 220" />
        <path d="M138 80 Q156 90 160 130 L154 200 Q150 218 146 220 L138 220" />
        <path d="M68 196 L132 196 L138 230 Q120 244 100 244 Q80 244 62 230 Z" />
        <path d="M72 232 Q70 280 76 330 Q82 348 92 348" />
        <path d="M128 232 Q130 280 124 330 Q118 348 108 348" />
      </g>
    </svg>
  );
}
