import { useEffect, useState } from "react";
import { FiDatabase, FiServer, FiCpu } from "react-icons/fi";

import { getSystemStatus, type SystemStatus } from "../services/system";
import { getModels, type ModelVersion } from "../services/models";

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// Real backend/DB/model info, fetched live - not a static placeholder panel.
export function SidebarStatus() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [activeModel, setActiveModel] = useState<ModelVersion | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [statusData, models] = await Promise.all([getSystemStatus(), getModels()]);
        if (cancelled) return;
        setStatus(statusData);
        setActiveModel(models.find((m) => m.is_active) || null);
        setUnreachable(false);
      } catch {
        if (!cancelled) setUnreachable(true);
      }
    }

    load();
    const intervalId = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const metrics = (activeModel?.metrics || {}) as Record<string, number | string>;
  const rawAccuracy = Number(metrics.test_accuracy ?? metrics.accuracy ?? 0);
  const accuracyPct = rawAccuracy > 0 ? (rawAccuracy <= 1 ? rawAccuracy * 100 : rawAccuracy) : null;

  return (
    <div className="sidebar-status">
      <div className="nav-section-label" style={{ margin: "0 12px 8px" }}>
        System Status
      </div>
      <div className="status-row">
        <FiServer />
        <span>Backend</span>
        <span className={`status-dot ${unreachable ? "off" : "on"}`} />
        <span className="status-value">{unreachable ? "Unreachable" : "Operational"}</span>
      </div>
      <div className="status-row">
        <FiDatabase />
        <span>Database</span>
        <span className={`status-dot ${status?.database.connected ? "on" : "off"}`} />
        <span className="status-value">{status?.database.provider ?? "..."}</span>
      </div>
      <div className="status-row">
        <FiCpu />
        <span>Model</span>
        <span className={`status-dot ${activeModel ? "on" : "off"}`} />
        <span className="status-value">{accuracyPct ? `${accuracyPct.toFixed(1)}%` : "N/A"}</span>
      </div>
      {status && (
        <div className="status-footnote">
          Uptime {formatUptime(status.uptime_seconds)} · {status.environment}
        </div>
      )}
    </div>
  );
}
