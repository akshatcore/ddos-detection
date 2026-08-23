import type { Incident } from "../services/incidents";

export const SEVERITY_COLORS: Record<string, string> = {
  low: "#05cd99",
  medium: "#ffb547",
  high: "#ff8a5c",
  critical: "#ef4444",
};

export const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

export const ATTACK_COLORS: Record<string, string> = {
  benign: "#05cd99",
  syn: "#ef4444",
  udp: "#ff8a5c",
  netbios: "#7551ff",
  unknown: "#4f8dfd",
};

// The backend bakes the ML predicted_label into the incident title as
// "<Severity> DDoS Alert (<Label>)" - parsing it here gives a real,
// data-driven attack-type breakdown instead of a fabricated one.
export function extractAttackType(title: string): string {
  const match = title.match(/\(([^)]+)\)\s*$/);
  return match ? match[1] : "Unknown";
}

export function buildAttackTypeDistribution(incidents: Incident[]) {
  const counts: Record<string, number> = {};
  for (const incident of incidents) {
    const label = extractAttackType(incident.title);
    counts[label] = (counts[label] || 0) + 1;
  }
  return Object.entries(counts).map(([name, count]) => ({
    name,
    value: count,
    color: ATTACK_COLORS[name.toLowerCase()] || "#4f8dfd",
  }));
}

export function buildSeverityDistribution(incidents: Incident[]) {
  const counts: Record<string, number> = {};
  for (const incident of incidents) {
    const key = incident.severity.toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts).map(([name, value]) => ({
    name,
    value,
    color: SEVERITY_COLORS[name] || "#94a3b8",
  }));
}

export type AttackerAggregate = {
  ip: string;
  count: number;
  totalBytes: number;
  totalPackets: number;
  lastSeen: string;
  worstSeverity: string;
  attackTypes: string[];
};

function worseSeverity(a: string, b: string): string {
  const ia = SEVERITY_ORDER.indexOf(a.toLowerCase());
  const ib = SEVERITY_ORDER.indexOf(b.toLowerCase());
  if (ia === -1) return b;
  if (ib === -1) return a;
  return ia <= ib ? a : b;
}

// Aggregates real attacker source IPs from each incident's linked flow -
// this is the actual attacker, not a fabricated one. Incidents whose flow
// wasn't linked (e.g. manually-created incidents) are skipped.
export function buildAttackerAggregates(incidents: Incident[]): AttackerAggregate[] {
  const byIp = new Map<string, AttackerAggregate>();

  for (const incident of incidents) {
    if (!incident.flow) continue;
    const ip = incident.flow.src_ip;
    const attackType = extractAttackType(incident.title);
    const existing = byIp.get(ip);

    if (!existing) {
      byIp.set(ip, {
        ip,
        count: 1,
        totalBytes: incident.flow.byte_count,
        totalPackets: incident.flow.packet_count,
        lastSeen: incident.created_at,
        worstSeverity: incident.severity,
        attackTypes: [attackType],
      });
    } else {
      existing.count += 1;
      existing.totalBytes += incident.flow.byte_count;
      existing.totalPackets += incident.flow.packet_count;
      if (new Date(incident.created_at) > new Date(existing.lastSeen)) {
        existing.lastSeen = incident.created_at;
      }
      existing.worstSeverity = worseSeverity(existing.worstSeverity, incident.severity);
      if (!existing.attackTypes.includes(attackType)) {
        existing.attackTypes.push(attackType);
      }
    }
  }

  return Array.from(byIp.values()).sort((a, b) => b.count - a.count);
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, exp)).toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}
