import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  FiAlertTriangle,
  FiUnlock,
  FiShield,
  FiActivity,
  FiCpu,
  FiZap,
  FiCheckCircle,
  FiRadio,
  FiTerminal,
} from "react-icons/fi";

import { getReportSummary, getMitigationBreakdown, type ReportSummary, type MitigationBreakdown } from "../services/reports";
import { getIncidents, type Incident } from "../services/incidents";
import { getModels, type ModelVersion } from "../services/models";
import { getStoredUser } from "../services/auth";
import { StatCard } from "../components/StatCard";
import { RingGauge } from "../components/Gauge";
import { Badge } from "../components/Badge";
import { Donut } from "../components/Donut";
import { AttackTopology } from "../components/AttackTopology";
import {
  buildAttackTypeDistribution,
  buildSeverityDistribution,
  buildAttackerAggregates,
  formatBytes,
  SEVERITY_COLORS,
} from "../utils/attackData";
import { timeAgo } from "../utils/time";

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

function pct(raw: number): number {
  if (!raw) return 0;
  return raw <= 1 ? raw * 100 : raw;
}

function Dashboard() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [models, setModels] = useState<ModelVersion[]>([]);
  const [mitigations, setMitigations] = useState<MitigationBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Distinct from `error`: `error` blocks the whole dashboard (only ever set
  // on the very first load, when there's no data to show yet at all).
  // `stale` covers the case that used to be silently swallowed - the
  // backend going away or a request timing out (see api.ts's 15s timeout)
  // AFTER data has already loaded once. Without this, losing the backend
  // mid-session left every number frozen with zero on-screen indication
  // anything was wrong; the "refreshes every 3s" label kept claiming the
  // page was live.
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadData(isFirstLoad: boolean) {
      try {
        const [summaryData, incidentsData, modelsData, mitigationData] = await Promise.all([
          getReportSummary(),
          getIncidents(),
          getModels(),
          getMitigationBreakdown(),
        ]);
        if (cancelled) return;
        setSummary(summaryData);
        setIncidents(incidentsData);
        setModels(modelsData);
        setMitigations(mitigationData);
        setError(null);
        setStale(false);
      } catch (err) {
        if (cancelled) return;
        if (isFirstLoad) {
          setError("Failed to load dashboard data from the backend.");
        } else {
          setStale(true);
        }
      } finally {
        if (!cancelled && isFirstLoad) setLoading(false);
      }
    }

    loadData(true);
    const intervalId = setInterval(() => loadData(false), 3000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const timeSeriesData = buildIncidentsOverTime(incidents);
  const attackTypeData = buildAttackTypeDistribution(incidents);
  const severityData = buildSeverityDistribution(incidents);
  const attackers = buildAttackerAggregates(incidents);
  const recentIncidents = [...incidents].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const recentAlerts = recentIncidents.slice(0, 6);
  const recentTable = recentIncidents.slice(0, 8);

  const activeModel = models.find((m) => m.is_active) || null;
  const metrics = (activeModel?.metrics || {}) as Record<string, number | string>;
  const accuracyPct = pct(Number(metrics.test_accuracy ?? metrics.accuracy ?? 0));
  const precisionPct = pct(Number(metrics.test_precision ?? metrics.precision ?? 0));
  const recallPct = pct(Number(metrics.test_recall ?? metrics.recall ?? 0));
  const f1Pct = pct(Number(metrics.test_f1 ?? metrics.f1 ?? 0));

  const user = getStoredUser();
  const firstName = user?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "Analyst";

  const mitigationTotal = mitigations?.total ?? summary?.mitigations ?? 0;
  const ipBlockedCount = mitigations?.by_type?.iptables_block ?? mitigationTotal;

  return (
    <div>
      {error && <div className="banner-error">{error}</div>}
      {!error && stale && (
        <div className="banner-error" style={{ background: "var(--accent-yellow, #b45309)" }}>
          Lost connection to the backend - showing the last data received. Retrying every 3s...
        </div>
      )}
      {loading && <p style={{ color: "var(--text-secondary)" }}>Loading live data from backend...</p>}

      {!loading && summary && (
        <>
          <div className="stat-grid">
            <StatCard
              label="Total Incidents"
              value={summary.incidents}
              icon={<FiAlertTriangle />}
              iconClass="icon-red"
            />
            <StatCard
              label="Open Incidents"
              value={summary.open_incidents}
              icon={<FiUnlock />}
              iconClass="icon-yellow"
              delta={summary.open_incidents > 0 ? "Needs attention" : "All clear"}
              deltaDirection={summary.open_incidents > 0 ? "down" : "up"}
            />
            <StatCard
              label="Mitigations Applied"
              value={summary.mitigations}
              icon={<FiShield />}
              iconClass="icon-purple"
            />
            <StatCard
              label="Active Model"
              value={summary.active_models > 0 ? "Online" : "Offline"}
              icon={<FiCpu />}
              iconClass={summary.active_models > 0 ? "icon-green" : "icon-red"}
              delta={activeModel ? `${activeModel.name} ${activeModel.version}` : undefined}
              deltaDirection="neutral"
            />
          </div>

          <div className="row-hero">
            <div className="glass-card pulse-hero">
              <svg className="pulse-radar" viewBox="0 0 120 120">
                <circle className="radar-ring" cx="60" cy="60" r="6" />
                <circle className="radar-ring" cx="60" cy="60" r="6" />
                <circle className="radar-ring" cx="60" cy="60" r="6" />
              </svg>
              <div>
                <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <FiActivity /> Welcome back, {firstName}
                </h2>
                <p>
                  Live capture, ML scoring, and the hybrid heuristic engine are watching your network
                  continuously - every settled flow gets evaluated automatically.
                </p>
              </div>
              <div className="pulse-tags">
                <div className="pulse-tag">
                  <span className="k">Flows analyzed</span>
                  <span className="v">{summary.flows}</span>
                </div>
                <div className="pulse-tag">
                  <span className="k">Predictions made</span>
                  <span className="v">{summary.predictions}</span>
                </div>
                <div className="pulse-tag">
                  <span className="k">Users</span>
                  <span className="v">{summary.users}</span>
                </div>
              </div>
            </div>

            <div className="glass-card">
              <div className="card-title">
                <h2>Attack Vector Breakdown</h2>
              </div>
              <Donut data={attackTypeData} totalLabel="Alerts" />
            </div>

            <div className="glass-card">
              <div className="card-title">
                <h2>Severity Distribution</h2>
              </div>
              <Donut data={severityData} totalLabel="Alerts" />
            </div>
          </div>

          <div className="card-grid-2">
            <div className="glass-card">
              <div className="card-title">
                <h2>Live Attack Topology</h2>
                <span className="hint">Real source IPs from triggered flows</span>
              </div>
              <AttackTopology attackers={attackers} />
            </div>

            <div className="glass-card">
              <div className="card-title">
                <h2>Recent Alerts</h2>
                <span className="hint">Live feed</span>
              </div>
              <div className="alert-feed">
                {recentAlerts.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No alerts yet.</p>
                ) : (
                  recentAlerts.map((item) => (
                    <div className="alert-feed-row" key={item.id}>
                      <span
                        className="legend-dot"
                        style={{ background: SEVERITY_COLORS[item.severity.toLowerCase()] || "#94a3b8" }}
                      />
                      <div className="alert-feed-text">
                        <div className="alert-feed-title">{item.title}</div>
                        <div className="alert-feed-meta">
                          {item.flow && <span className="mono-text">{item.flow.src_ip}</span>}
                          <span>{timeAgo(item.created_at)}</span>
                        </div>
                      </div>
                      <Badge text={item.status} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="card-grid-2">
            <div className="glass-card" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div className="card-title" style={{ width: "100%" }}>
                <h2>Model Performance</h2>
              </div>
              <RingGauge
                value={accuracyPct}
                color={accuracyPct >= 90 ? "var(--accent-green)" : "var(--accent-yellow)"}
                label="Accuracy"
                size={130}
              />
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                {activeModel ? `${activeModel.name} ${activeModel.version}` : "No active model"}
              </div>
              <div className="perf-mini-row">
                <div className="perf-mini">
                  <div className="k">Precision</div>
                  <div className="v">{precisionPct ? `${precisionPct.toFixed(1)}%` : "N/A"}</div>
                </div>
                <div className="perf-mini">
                  <div className="k">Recall</div>
                  <div className="v">{recallPct ? `${recallPct.toFixed(1)}%` : "N/A"}</div>
                </div>
                <div className="perf-mini">
                  <div className="k">F1 Score</div>
                  <div className="v">{f1Pct ? `${f1Pct.toFixed(1)}%` : "N/A"}</div>
                </div>
              </div>
            </div>

            <div className="glass-card">
              <div className="card-title">
                <h2>Top Attacking IPs</h2>
                <span className="hint">By alert count</span>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Source IP</th>
                      <th>Alerts</th>
                      <th>Traffic</th>
                      <th>Severity</th>
                      <th>Last Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attackers.length === 0 ? (
                      <tr>
                        <td colSpan={5}>No attacker data yet.</td>
                      </tr>
                    ) : (
                      attackers.slice(0, 6).map((a) => (
                        <tr key={a.ip}>
                          <td className="mono-text">{a.ip}</td>
                          <td>{a.count}</td>
                          <td>{formatBytes(a.totalBytes)}</td>
                          <td>
                            <Badge text={a.worstSeverity} />
                          </td>
                          <td>{timeAgo(a.lastSeen)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card-grid-2">
            <div className="glass-card">
              <div className="card-title">
                <h2>Incidents Over Time</h2>
                <span className="hint">Live, refreshes every 3s</span>
              </div>
              {timeSeriesData.length === 0 ? (
                <p style={{ color: "var(--text-muted)" }}>No incident data yet to plot.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={timeSeriesData}>
                    <defs>
                      <linearGradient id="incidentFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f8dfd" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#4f8dfd" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" />
                    <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={11} />
                    <YAxis allowDecimals={false} stroke="var(--text-muted)" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card-bg-solid)",
                        border: "1px solid var(--card-border)",
                        borderRadius: 10,
                        color: "var(--text-primary)",
                      }}
                    />
                    <Area type="monotone" dataKey="incidents" stroke="#4f8dfd" strokeWidth={3} fill="url(#incidentFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}

              <div className="mini-stat-row">
                <div className="mini-stat">
                  <div className="k">
                    <FiZap /> Flows
                  </div>
                  <div className="v">{summary.flows}</div>
                </div>
                <div className="mini-stat">
                  <div className="k">
                    <FiZap /> Predictions
                  </div>
                  <div className="v">{summary.predictions}</div>
                </div>
                <div className="mini-stat">
                  <div className="k">
                    <FiCheckCircle /> Mitigated
                  </div>
                  <div className="v">{summary.mitigations}</div>
                </div>
                <div className="mini-stat">
                  <div className="k">
                    <FiAlertTriangle /> Open
                  </div>
                  <div className="v">{summary.open_incidents}</div>
                </div>
              </div>
            </div>

            <div className="glass-card">
              <div className="card-title">
                <h2>Mitigation Actions</h2>
                <span className="hint">Real actions taken</span>
              </div>
              <div className="mitigation-summary">
                <div className="mitigation-pill">
                  <div className="k">Total Actions</div>
                  <div className="v">{mitigationTotal}</div>
                </div>
                <div className="mitigation-pill">
                  <div className="k">IP Blocked</div>
                  <div className="v">{ipBlockedCount}</div>
                </div>
              </div>
              <div>
                {!mitigations || mitigations.recent.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No mitigations executed yet.</p>
                ) : (
                  mitigations.recent.map((action) => (
                    <div className="mitigation-recent-row" key={action.id}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <FiTerminal style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                        <span className="mono-text" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {action.command}
                        </span>
                      </span>
                      <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{timeAgo(action.created_at)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="glass-card">
            <div className="card-title">
              <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <FiRadio /> Recent Security Incidents
              </h2>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Title</th>
                    <th>Source IP</th>
                    <th>Severity</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTable.length === 0 ? (
                    <tr>
                      <td colSpan={5}>No incidents recorded yet.</td>
                    </tr>
                  ) : (
                    recentTable.map((item) => (
                      <tr key={item.id}>
                        <td>{new Date(item.created_at).toLocaleString()}</td>
                        <td>{item.title}</td>
                        <td className="mono-text">{item.flow?.src_ip ?? "—"}</td>
                        <td>
                          <Badge text={item.severity} />
                        </td>
                        <td>
                          <Badge text={item.status} />
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

export default Dashboard;
