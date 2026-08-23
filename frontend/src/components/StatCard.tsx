import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  iconClass?: string;
  delta?: string;
  deltaDirection?: "up" | "down" | "neutral";
};

export function StatCard({ label, value, icon, iconClass = "icon-blue", delta, deltaDirection = "neutral" }: StatCardProps) {
  return (
    <div className="glass-card stat-card">
      <div className="stat-text">
        <div className="label">{label}</div>
        <div className="value">{value}</div>
        {delta && <div className={`delta ${deltaDirection}`}>{delta}</div>}
      </div>
      <div className={`stat-icon ${iconClass}`}>{icon}</div>
    </div>
  );
}
