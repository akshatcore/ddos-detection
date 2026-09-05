import { useState, useEffect } from "react";
import { getIncidents, mitigateIncident, type Incident } from "../services/incidents";
import { Badge } from "../components/Badge";

function Incidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [mitigatingId, setMitigatingId] = useState<number | null>(null);

  async function loadIncidents(isFirstLoad = false) {
    try {
      const data = await getIncidents();
      setIncidents(data);
      setError(null);
      setStale(false);
    } catch (err) {
      // Only block the whole table on the very first load - a background
      // refresh hiccup shows a small stale-data banner instead (see
      // Dashboard.tsx for the same pattern and the reasoning behind it).
      if (isFirstLoad) {
        setError("Failed to load incidents from the backend.");
      } else {
        setStale(true);
      }
    } finally {
      if (isFirstLoad) setLoading(false);
    }
  }

  useEffect(() => {
    loadIncidents(true);
    // Live-refresh every 3s so new incidents (e.g. from an in-progress
    // attack demo) show up automatically without a manual page reload.
    const intervalId = setInterval(() => loadIncidents(false), 3000);
    return () => clearInterval(intervalId);
  }, []);

  async function handleMitigate(id: number) {
    setMitigatingId(id);
    try {
      // Calls the real backend mitigation endpoint - this executes an
      // actual Windows Firewall block (netsh advfirewall) server-side, not
      // a simulation, and not just a local UI state change.
      await mitigateIncident(id);
      await loadIncidents();
    } catch (err) {
      setError("Failed to trigger mitigation.");
    } finally {
      setMitigatingId(null);
    }
  }

  const openCount = incidents.filter((i) => i.status === "open").length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 2 }}>Security Incidents</h1>
          <div className="subtitle">{openCount} open · {incidents.length} total</div>
        </div>
      </div>

      {error && <div className="banner-error">{error}</div>}
      {!error && stale && (
        <div className="banner-error" style={{ background: "var(--accent-yellow, #b45309)" }}>
          Lost connection to the backend - showing the last data received. Retrying every 3s...
        </div>
      )}
      {loading && <p style={{ color: "var(--text-secondary)" }}>Loading incidents...</p>}

      {!loading && !error && (
        <div className="glass-card">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Title</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {incidents.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No incidents recorded yet.</td>
                  </tr>
                ) : (
                  incidents.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.created_at).toLocaleString()}</td>
                      <td>{item.title}</td>
                      <td>
                        <Badge text={item.severity} />
                      </td>
                      <td>
                        <Badge text={item.status} />
                      </td>
                      <td>
                        <button
                          className="btn-primary"
                          onClick={() => handleMitigate(item.id)}
                          disabled={mitigatingId === item.id || item.status === "resolved"}
                        >
                          {mitigatingId === item.id ? "Mitigating..." : "Mitigate"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default Incidents;
