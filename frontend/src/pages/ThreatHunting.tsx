import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { FiSearch, FiCrosshair } from "react-icons/fi";

import { getIncidents, mitigateIncident, type Incident } from "../services/incidents";
import { Badge } from "../components/Badge";

// Note: the backend does not currently expose source-IP or geolocation data
// through any API endpoint (Flow records containing src_ip are not exposed
// via a GET endpoint). Rather than fabricate IP/location data, this page is
// built as a real search tool over actual incident records instead.
function ThreatHunting() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mitigatingId, setMitigatingId] = useState<number | null>(null);

  async function loadIncidents(isFirstLoad = false) {
    try {
      const data = await getIncidents();
      setIncidents(data);
      setError(null);
    } catch (err) {
      if (isFirstLoad) setError("Failed to load incidents from the backend.");
    } finally {
      if (isFirstLoad) setLoading(false);
    }
  }

  useEffect(() => {
    loadIncidents(true);
    // Live-refresh every 3s so new incidents show up automatically without
    // a manual page reload - handy while an attack demo is in progress.
    const intervalId = setInterval(() => loadIncidents(false), 3000);
    return () => clearInterval(intervalId);
  }, []);

  // Keep the URL's ?q= in sync so a search from the topbar (on any page)
  // lands here pre-filled, and refreshing this page preserves the search.
  useEffect(() => {
    if (query) {
      setSearchParams({ q: query });
    } else {
      setSearchParams({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

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
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 2, display: "flex", alignItems: "center", gap: 10 }}>
            <FiCrosshair /> Threat Hunting
          </h1>
          <div className="subtitle">Search across every incident title, severity, status, and reason</div>
        </div>
      </div>

      <div className="glass-card" style={{ marginBottom: 22 }}>
        <div style={{ position: "relative" }}>
          <FiSearch
            style={{
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
            }}
          />
          <input
            type="text"
            className="field-input"
            placeholder="Search incidents by title, severity, status, or description..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: 38 }}
          />
        </div>
      </div>

      {loading && <p style={{ color: "var(--text-secondary)" }}>Loading incidents...</p>}
      {error && <div className="banner-error">{error}</div>}

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

export default ThreatHunting;
