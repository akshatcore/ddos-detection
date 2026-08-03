import "../styles/Dashboard.css";
import { useState, useEffect } from "react";
import { getIncidents, mitigateIncident, type Incident } from "../services/incidents";

function Incidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mitigatingId, setMitigatingId] = useState<number | null>(null);

  async function loadIncidents() {
    try {
      const data = await getIncidents();
      setIncidents(data);
    } catch (err) {
      setError("Failed to load incidents from the backend.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadIncidents();
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

  return (
    <div className="main">
      <h1>🚨 Security Incidents</h1>

      {loading && <p>Loading incidents...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && !error && (
        <div className="table-box">
          <table className="incident-table">
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
                      <span className={item.severity.toLowerCase()}>{item.severity}</span>
                    </td>
                    <td>{item.status}</td>
                    <td>
                      <button
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
      )}
    </div>
  );
}

export default Incidents;
