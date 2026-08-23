import { FiServer } from "react-icons/fi";
import type { AttackerAggregate } from "../utils/attackData";
import { SEVERITY_COLORS } from "../utils/attackData";

type AttackTopologyProps = {
  attackers: AttackerAggregate[];
};

const SIZE = 320;
const CENTER = SIZE / 2;
const RADIUS = 118;
const MAX_NODES = 7;

// Real attacker -> server topology built from actual flow.src_ip data on
// triggered incidents. Deliberately NOT a fake geo-located world map: this
// project's traffic comes from a LAN/VM setup with private IPs, so plotting
// them on a world globe with invented countries would just be fabricated
// data. This is the honest equivalent - real IPs, real severities, real
// attack counts, animated flowing toward the protected server.
export function AttackTopology({ attackers }: AttackTopologyProps) {
  const shown = attackers.slice(0, MAX_NODES);

  if (shown.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 280, color: "var(--text-muted)", fontSize: 13.5 }}>
        No attacker flows recorded yet - trigger an attack to see it appear here live.
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" height={300}>
      <defs>
        <radialGradient id="serverGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4f8dfd" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#4f8dfd" stopOpacity="0" />
        </radialGradient>
      </defs>

      {shown.map((attacker, index) => {
        const angle = (index / shown.length) * Math.PI * 2 - Math.PI / 2;
        const x = CENTER + RADIUS * Math.cos(angle);
        const y = CENTER + RADIUS * Math.sin(angle);
        const color = SEVERITY_COLORS[attacker.worstSeverity.toLowerCase()] || "#4f8dfd";
        const pathId = `path-${index}`;
        const duration = 2.2 + (index % 3) * 0.4;

        return (
          <g key={attacker.ip}>
            <path
              id={pathId}
              d={`M ${x} ${y} Q ${CENTER} ${CENTER} ${CENTER} ${CENTER}`}
              fill="none"
              stroke={color}
              strokeOpacity={0.28}
              strokeWidth={1.5}
            />
            <circle r="3.4" fill={color}>
              <animateMotion dur={`${duration}s`} repeatCount="indefinite" path={`M ${x} ${y} Q ${CENTER} ${CENTER} ${CENTER} ${CENTER}`} />
            </circle>
            <circle cx={x} cy={y} r="5.5" fill={color} />
            <circle cx={x} cy={y} r="9" fill={color} opacity="0.25" />
            <text x={x} y={y + (y > CENTER ? 20 : -14)} textAnchor="middle" fontSize="9.5" fill="var(--text-secondary)">
              {attacker.ip}
            </text>
          </g>
        );
      })}

      <circle cx={CENTER} cy={CENTER} r="46" fill="url(#serverGlow)" />
      <circle cx={CENTER} cy={CENTER} r="22" fill="var(--card-bg-solid)" stroke="var(--accent-blue)" strokeWidth="2" />
      <foreignObject x={CENTER - 11} y={CENTER - 11} width="22" height="22">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--accent-blue)" }}>
          <FiServer size={14} />
        </div>
      </foreignObject>
      <text x={CENTER} y={CENTER + 38} textAnchor="middle" fontSize="9.5" fill="var(--text-muted)">
        Protected server
      </text>
    </svg>
  );
}
