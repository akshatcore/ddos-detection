import { useState, useEffect } from "react";
import { getIncidents, mitigateIncident, type Incident } from "../services/incidents";
import { Badge } from "../components/Badge";

function Incidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mitigatingId, setMitigatingId] = useState<number | null>(null);

  async function loadIncidents(isFirstLoad = false) {
    try {
      const data = await getIncidents();
      setIncidents(data);
      setError(null);
    } catch (err) {
      // Only surface the error banner on the very first load - a background
      // refresh hiccup shouldn't blank out an otherwise-working table.
      if (isFirstLoad) setError("Failed to load incidents from the backend.");
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
      // Calls the real backend mitigation endpoint - this actually creates
      // a simulated mitigation record server-side, it does not just change
      // local UI state.
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
