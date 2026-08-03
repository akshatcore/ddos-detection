import "../styles/Dashboard.css";
import { useState, useEffect } from "react";
import { getIncidents, mitigateIncident, type Incident } from "../services/incidents";

// Note: the backend does not currently expose source-IP or geolocation data
// through any API endpoint (Flow records containing src_ip are not exposed
// via a GET endpoint). Rather than fabricate IP/location data, this page is
// built as a real search tool over actual incident records instead.
function ThreatHunting() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [query, setQuery] = useState("");
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
      await mitigateIncident(id);
      await loadIncidents();
    } catch (err) {
      setError("Failed to trigger mitigation.");
    } finally {
      setMitigatingId(null);
    }
  }

  const filtered = incidents.filter((item) => {
    const q = query.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.severity.toLowerCase().includes(q) ||
      item.status.toLowerCase().includes(q) ||
      (item.description || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="main">
      <h1>🛡 Threat Hunting</h1>

      <input
        type="text"
        placeholder="Search incidents by title, severity, status, or description..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: "100%", padding: "8px", marginBottom: "16px" }}
      />

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
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5}>No matching incidents.</td>
                </tr>
              ) : (
                filtered.map((item) => (
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

export default ThreatHunting;
