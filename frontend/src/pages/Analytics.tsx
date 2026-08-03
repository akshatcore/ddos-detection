import "../styles/Analytics.css";
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

import { getIncidents, type Incident } from "../services/incidents";
import { getModels, type ModelVersion } from "../services/models";

const SEVERITY_COLORS: Record<string, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ef4444",
  critical: "#7c3aed",
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
    async function loadData() {
      try {
        const [incidentsData, modelsData] = await Promise.all([getIncidents(), getModels()]);
        setIncidents(incidentsData);
        setActiveModel(modelsData.find((m) => m.is_active) || modelsData[0] || null);
      } catch (err) {
        setError("Failed to load analytics data from the backend.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const weeklyData = buildWeeklyTrend(incidents);
  const severityData = buildSeverityDistribution(incidents);
  const statusBreakdown = buildStatusBreakdown(incidents);

  // Model metrics come directly from whatever was registered via POST /models
  // (e.g. accuracy/precision/recall saved alongside the trained model) -
  // these are real numbers from the actual model, not invented placeholders.
  const metrics = (activeModel?.metrics || {}) as Record<string, number | string>;

  return (
    <div className="analytics">
      <h1>📊 Analytics Dashboard</h1>

      {loading && <p>Loading analytics from backend...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && !error && (
        <>
          <div className="analytics-cards">
            <div className="analytics-card">
              <h3>Active Model</h3>
              <p>{activeModel ? `${activeModel.name} (${activeModel.version})` : "None registered"}</p>
            </div>
            <div className="analytics-card">
              <h3>Model Accuracy</h3>
              <p>{metrics.test_accuracy ?? metrics.accuracy ?? "N/A"}</p>
            </div>
            <div className="analytics-card">
              <h3>Model Recall</h3>
              <p>{metrics.test_recall ?? metrics.recall ?? "N/A"}</p>
            </div>
            <div className="analytics-card">
              <h3>Total Incidents Logged</h3>
              <p>{incidents.length}</p>
            </div>
          </div>

          <div className="chart">
            <h2>📈 Weekly Incident Trend</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="incidents" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart">
            <h2>🥧 Incidents by Severity</h2>
            {severityData.length === 0 ? (
              <p>No incident data yet to plot.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={severityData} dataKey="value" nameKey="name" outerRadius={100} label>
                    {severityData.map((item, index) => (
                      <Cell key={index} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="ip-box">
            <h2>Incidents by Status</h2>
            <table>
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
                      <td>{status}</td>
                      <td>{count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default Analytics;
