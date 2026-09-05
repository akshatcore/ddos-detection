import { useState, useEffect } from "react";
import { FiSettings } from "react-icons/fi";
import { getSettings, updateSettings, type Settings as SettingsType } from "../services/settings";

// Mirrors exactly what the backend actually persists and exposes
// (confidence_threshold, packet_rate_threshold, session_timeout_minutes) -
// no fabricated firewall/monitoring toggle switches that don't correspond
// to any real backend state. "Mitigation Network Interface" used to be
// here too, but real mitigation (backend/app/services/mitigation.py) blocks
// by remote IP via netsh, not by interface name - that field controlled
// nothing real, so it was removed rather than left as a working-looking
// but inert control.
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
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 2, display: "flex", alignItems: "center", gap: 10 }}>
            <FiSettings /> Security Settings
          </h1>
          <div className="subtitle">Detection &amp; mitigation configuration</div>
        </div>
      </div>

      {loading && <p style={{ color: "var(--text-secondary)" }}>Loading settings...</p>}
      {error && <div className="banner-error">{error}</div>}
      {success && <div className="banner-success">Settings saved.</div>}

      {!loading && settings && (
        <div className="glass-card" style={{ maxWidth: 560 }}>
          <div className="data-table-wrap">
            <table className="data-table">
              <tbody>
                <tr>
                  <td>Confidence Threshold (0-1)</td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      className="field-input"
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
                      className="field-input"
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
                      className="field-input"
                      value={settings.session_timeout_minutes}
                      onChange={(e) =>
                        setSettings({ ...settings, session_timeout_minutes: parseInt(e.target.value) })
                      }
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ marginTop: 16 }}>
            {saving ? "Saving..." : "Save Settings"}
          </button>
          <p style={{ fontSize: "0.85em", color: "var(--text-muted)", marginTop: 10 }}>
            Note: saving requires an Admin role account.
          </p>
        </div>
      )}
    </div>
  );
}

export default Settings;
