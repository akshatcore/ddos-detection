import "../styles/Dashboard.css";
import { useState, useEffect } from "react";
import { getSettings, updateSettings, type Settings as SettingsType } from "../services/settings";

// Mirrors exactly what the backend actually persists and exposes
// (confidence_threshold, packet_rate_threshold, session_timeout_minutes,
// mitigation_interface) - no fabricated firewall/monitoring toggle switches
// that don't correspond to any real backend state.
function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => setError("Failed to load settings from the backend."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setSuccess(false);
    setError(null);
    try {
      const updated = await updateSettings(settings);
      setSettings(updated);
      setSuccess(true);
    } catch (err) {
      setError("Failed to save settings. Admin role required.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="main">
      <h1>⚙️ Security Settings</h1>

      {loading && <p>Loading settings...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {success && <p style={{ color: "limegreen" }}>Settings saved.</p>}

      {!loading && settings && (
        <div className="table-box">
          <h2>🔧 Detection &amp; Mitigation Configuration</h2>
          <table className="incident-table">
            <tbody>
              <tr>
                <td>Confidence Threshold (0-1)</td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={settings.confidence_threshold}
                    onChange={(e) =>
                      setSettings({ ...settings, confidence_threshold: parseFloat(e.target.value) })
                    }
                  />
                </td>
              </tr>
              <tr>
                <td>Packet Rate Threshold</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    value={settings.packet_rate_threshold}
                    onChange={(e) =>
                      setSettings({ ...settings, packet_rate_threshold: parseFloat(e.target.value) })
                    }
                  />
                </td>
              </tr>
              <tr>
                <td>Session Timeout (minutes)</td>
                <td>
                  <input
                    type="number"
                    min="1"
                    value={settings.session_timeout_minutes}
                    onChange={(e) =>
                      setSettings({ ...settings, session_timeout_minutes: parseInt(e.target.value) })
                    }
                  />
                </td>
              </tr>
              <tr>
                <td>Mitigation Network Interface</td>
                <td>
                  <input
                    type="text"
                    value={settings.mitigation_interface}
                    onChange={(e) => setSettings({ ...settings, mitigation_interface: e.target.value })}
                  />
                </td>
              </tr>
            </tbody>
          </table>

          <button onClick={handleSave} disabled={saving} style={{ marginTop: "12px" }}>
            {saving ? "Saving..." : "Save Settings"}
          </button>
          <p style={{ fontSize: "0.85em", color: "#666", marginTop: "8px" }}>
            Note: saving requires an Admin role account.
          </p>
        </div>
      )}
    </div>
  );
}

export default Settings;
