import "../styles/Dashboard.css";
import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
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

import { getReportSummary, type ReportSummary } from "../services/reports";
import { getIncidents, type Incident } from "../services/incidents";

const SEVERITY_COLORS: Record<string, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ef4444",
  critical: "#7c3aed",
};

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

function buildIncidentsOverTime(incidents: Incident[]) {
  // Groups real incidents by hour of creation - an honest substitute for a
  // live packet-rate graph, since the backend does not expose a time-series
  // traffic endpoint. Every value here is derived from real incident data.
  const buckets: Record<string, number> = {};
  for (const incident of incidents) {
    const hour = new Date(incident.created_at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    buckets[hour] = (buckets[hour] || 0) + 1;
  }
  return Object.entries(buckets)
    .map(([time, count]) => ({ time, incidents: count }))
    .slice(-12);
}

function Dashboard() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [summaryData, incidentsData] = await Promise.all([
          getReportSummary(),
          getIncidents(),
        ]);
        setSummary(summaryData);
        setIncidents(incidentsData);
      } catch (err) {
        setError("Failed to load dashboard data from the backend.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const severityData = buildSeverityDistribution(incidents);
  const timeSeriesData = buildIncidentsOverTime(incidents);
  const recentIncidents = [...incidents]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

  return (
    <div className="dashboard">
      {/* SIDEBAR */}
      <div className="sidebar">
        <h2>DDoS SOC</h2>
        <ul>
          <li>🏠 Dashboard</li>
          <li onClick={() => (window.location.href = "/analytics")} style={{ cursor: "pointer" }}>
            📊 Analytics
          </li>
          <li onClick={() => (window.location.href = "/incidents")} style={{ cursor: "pointer" }}>
            🚨 Incidents
          </li>
          <li onClick={() => (window.location.href = "/threat-hunting")} style={{ cursor: "pointer" }}>
            🛡 Threat Hunting
          </li>
          <li onClick={() => (window.location.href = "/reports")} style={{ cursor: "pointer" }}>
            📄 Reports
          </li>
          <li onClick={() => (window.location.href = "/settings")} style={{ cursor: "pointer" }}>
            ⚙️ Settings
          </li>
        </ul>
      </div>

      {/* MAIN */}
      <div className="main">
        <h1>ML-Based DDoS Detection Dashboard</h1>

        {loading && <p>Loading live data from backend...</p>}
        {error && <p style={{ color: "red" }}>{error}</p>}

        {!loading && !error && summary && (
          <>
            <div className="cards">
              <div className="card">
                <h3>Total Incidents</h3>
                <p>{summary.incidents}</p>
              </div>
              <div className="card">
                <h3>Open Incidents</h3>
                <p style={{ color: summary.open_incidents > 0 ? "#ef4444" : "limegreen" }}>
                  {summary.open_incidents}
                </p>
              </div>
              <div className="card">
                <h3>Mitigations Applied</h3>
                <p>{summary.mitigations}</p>
              </div>
              <div className="card">
                <h3>Active Model(s)</h3>
                <p style={{ color: summary.active_models > 0 ? "limegreen" : "#ef4444" }}>
                  {summary.active_models > 0 ? "Online" : "None Deployed"}
                </p>
              </div>
              <div className="card">
                <h3>Flows Analyzed</h3>
                <p>{summary.flows}</p>
              </div>
              <div className="card">
                <h3>Predictions Made</h3>
                <p>{summary.predictions}</p>
              </div>
            </div>

            <div className="graph-box">
              <h2>Incidents Over Time</h2>
              {timeSeriesData.length === 0 ? (
                <p>No incident data yet to plot.</p>
              ) : (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="incidents" stroke="#2563eb" strokeWidth={3} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="graph-box">
              <h2>Incidents by Severity</h2>
              {severityData.length === 0 ? (
                <p>No incident data yet to plot.</p>
              ) : (
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie data={severityData} dataKey="value" nameKey="name" outerRadius={120} label>
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

            <div className="table-box">
              <h2>🚨 Recent Security Incidents</h2>
              <table className="incident-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Title</th>
                    <th>Severity</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentIncidents.length === 0 ? (
                    <tr>
                      <td colSpan={4}>No incidents recorded yet.</td>
                    </tr>
                  ) : (
                    recentIncidents.map((item) => (
                      <tr key={item.id}>
                        <td>{new Date(item.created_at).toLocaleString()}</td>
                        <td>{item.title}</td>
                        <td>{item.severity}</td>
                        <td>{item.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
