type GaugeProps = {
  value: number; // 0-100
  color?: string;
  label?: string;
  size?: number;
};

// Semi-circle gauge (mirrors the "Satisfaction Rate" style dial from the
// reference design) built with a plain SVG arc - no chart library needed
// for something this simple, keeps the bundle light.
export function SemiGauge({ value, color = "var(--accent-blue)", label, size = 170 }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 50;
  const circumference = Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="gauge-wrap" style={{ width: size }}>
      <svg viewBox="0 0 120 66" width="100%">
        <path
          d="M10,60 A50,50 0 0 1 110,60"
          fill="none"
          stroke="var(--divider)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M10,60 A50,50 0 0 1 110,60"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
        <circle cx="34" cy="60" r="2.4" fill={color} opacity="0.001" />
      </svg>
      <div className="gauge-value">{Math.round(clamped)}%</div>
      {label && <div className="gauge-caption">{label}</div>}
    </div>
  );
}

// Full-circle radial score gauge (mirrors the "Safety / Total Score" ring).
export function RingGauge({ value, color = "var(--accent-green)", label, size = 120 }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="gauge-wrap" style={{ width: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--divider)" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
        <text x="50" y="47" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--text-primary)">
          {clamped % 1 === 0 ? clamped : clamped.toFixed(1)}
        </text>
        {label && (
          <text x="50" y="64" textAnchor="middle" fontSize="8" fill="var(--text-muted)">
            {label}
          </text>
        )}
      </svg>
    </div>
  );
}
