import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { FiCpu, FiTarget, FiTrendingUp, FiAlertTriangle, FiBarChart2, FiPieChart } from "react-icons/fi";

import { getIncidents, type Incident } from "../services/incidents";
import { getModels, type ModelVersion } from "../services/models";
import { StatCard } from "../components/StatCard";
import { SemiGauge } from "../components/Gauge";
import { Badge } from "../components/Badge";
import { extractAttackType } from "../utils/attackData";
import { timeAgo } from "../utils/time";

const SEVERITY_COLORS: Record<string, string> = {
  low: "#05cd99",
  medium: "#ffb547",
  high: "#ff8a5c",
  critical: "#ef4444",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function buildWeeklyTrend(incidents: Incident[]) {
  const counts = new Array(7).fill(0);
  for (const incident of incidents) {
    const day = new Date(incident.created_at).getDay();
    counts[day] += 1;
  }
  return DAY_NAMES.map((day, index) => ({ day, incidents: counts[index] }));
}

function buildSeverityDistribution(incidents: Incident[]) {
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

function buildStatusBreakdown(incidents: Incident[]) {
  const counts: Record<string, number> = {};
  for (const incident of incidents) {
    counts[incident.status] = (counts[incident.status] || 0) + 1;
  }
  return Object.entries(counts);
}

function Analytics() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [activeModel, setActiveModel] = useState<ModelVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData(isFirstLoad: boolean) {
      try {
        const [incidentsData, modelsData] = await Promise.all([getIncidents(), getModels()]);
        setIncidents(incidentsData);
        setActiveModel(modelsData.find((m) => m.is_active) || modelsData[0] || null);
        setError(null);
      } catch (err) {
        if (isFirstLoad) setError("Failed to load analytics data from the backend.");
      } finally {
        if (isFirstLoad) setLoading(false);
      }
    }
    loadData(true);
    // Live-refresh every 3s so new incidents show up automatically without
    // a manual page reload - handy while an attack demo is in progress.
    const intervalId = setInterval(() => loadData(false), 3000);
    return () => clearInterval(intervalId);
  }, []);

  const weeklyData = buildWeeklyTrend(incidents);
  const severityData = buildSeverityDistribution(incidents);
  const statusBreakdown = buildStatusBreakdown(incidents);

  // Model metrics come directly from whatever was registered via POST /models
  // (e.g. accuracy/precision/recall saved alongside the trained model) -
  // these are real numbers from the actual model, not invented placeholders.
  const metrics = (activeModel?.metrics || {}) as Record<string, number | string>;
  const rawAccuracy = Number(metrics.test_accuracy ?? metrics.accuracy ?? 0);
  const accuracyPct = rawAccuracy > 0 ? (rawAccuracy <= 1 ? rawAccuracy * 100 : rawAccuracy) : 0;
  const rawRecall = Number(metrics.test_recall ?? metrics.recall ?? 0);
  const recallPct = rawRecall > 0 ? (rawRecall <= 1 ? rawRecall * 100 : rawRecall) : 0;

  return (
    <div>
      {error && <div className="banner-error">{error}</div>}
      {loading && <p style={{ color: "var(--text-secondary)" }}>Loading analytics from backend...</p>}

      {!loading && !error && (
        <>
          <div className="stat-grid">
            <StatCard
              label="Active Model"
              value={activeModel ? `${activeModel.name}` : "None"}
              icon={<FiCpu />}
              iconClass="icon-purple"
              delta={activeModel ? `v${activeModel.version}` : undefined}
            />
            <StatCard
              label="Model Accuracy"
              value={accuracyPct ? `${accuracyPct.toFixed(1)}%` : "N/A"}
              icon={<FiTarget />}
              iconClass="icon-blue"
            />
            <StatCard
              label="Model Recall"
              value={recallPct ? `${recallPct.toFixed(1)}%` : "N/A"}
              icon={<FiTrendingUp />}
              iconClass="icon-green"
            />
            <StatCard
              label="Total Incidents Logged"
              value={incidents.length}
              icon={<FiAlertTriangle />}
              iconClass="icon-red"
            />
          </div>

          <div className="card-grid-2">
            <div className="glass-card">
              <div className="card-title">
                <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <FiBarChart2 /> Weekly Incident Trend
                </h2>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" />
                  <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={11} />
                  <YAxis allowDecimals={false} stroke="var(--text-muted)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card-bg-solid)",
                      border: "1px solid var(--card-border)",
                      borderRadius: 10,
                      color: "var(--text-primary)",
                    }}
                  />
                  <Bar dataKey="incidents" fill="var(--accent-red)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-card" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div className="card-title" style={{ width: "100%" }}>
                <h2>Model Accuracy</h2>
              </div>
              <SemiGauge value={accuracyPct} color="var(--accent-blue)" label="Test accuracy" />
              <div className="gauge-scale" style={{ width: 170 }}>
                <span>0%</span>
                <span>100%</span>
              </div>
            </div>
          </div>

          <div className="card-grid-2">
            <div className="glass-card">
              <div className="card-title">
                <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <FiPieChart /> Incidents by Severity
                </h2>
              </div>
              {severityData.length === 0 ? (
                <p style={{ color: "var(--text-muted)" }}>No incident data yet to plot.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={severityData} dataKey="value" nameKey="name" outerRadius={95} label>
                      {severityData.map((item, index) => (
                        <Cell key={index} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--card-bg-solid)",
                        border: "1px solid var(--card-border)",
                        borderRadius: 10,
                        color: "var(--text-primary)",
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="glass-card">
              <div className="card-title">
                <h2>Incidents by Status</h2>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statusBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={2}>No incidents recorded yet.</td>
                      </tr>
                    ) : (
                      statusBreakdown.map(([status, count]) => (
                        <tr key={status}>
                          <td style={{ textTransform: "capitalize" }}>{status}</td>
                          <td>{count}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="glass-card">
            <div className="card-title">
              <h2>Attack Details</h2>
              <span className="hint">Real source/destination IP and flow data behind each triggered alert</span>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Source IP</th>
                    <th>Destination IP</th>
                    <th>Protocol</th>
                    <th>Attack Type</th>
                    <th>Confidence</th>
                    <th>Packet Rate</th>
                    <th>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.filter((i) => i.flow).length === 0 ? (
                    <tr>
                      <td colSpan={8}>No attack flow data recorded yet.</td>
                    </tr>
                  ) : (
                    incidents
                      .filter((i) => i.flow)
                      .slice(0, 12)
                      .map((item) => (
                        <tr key={item.id}>
                          <td>{timeAgo(item.created_at)}</td>
                          <td className="mono-text">{item.flow!.src_ip}</td>
                          <td className="mono-text">{item.flow!.dst_ip}</td>
                          <td>{item.flow!.protocol}</td>
                          <td style={{ textTransform: "capitalize" }}>{extractAttackType(item.title)}</td>
                          <td>{item.prediction ? `${(item.prediction.confidence * 100).toFixed(1)}%` : "N/A"}</td>
                          <td>{item.flow!.packet_rate.toFixed(0)} pkt/s</td>
                          <td>
                            <Badge text={item.severity} />
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Analytics;
