import { useState, useEffect } from "react";
import { FiSettings, FiTrash2 } from "react-icons/fi";
import { getSettings, updateSettings, clearOperationalData, type Settings as SettingsType } from "../services/settings";
import { getStoredUser } from "../services/auth";

const CONFIRM_PHRASE = "DELETE";

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

  const isAdmin = getStoredUser()?.role?.name === "Admin";
  const [showClearModal, setShowClearModal] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearSuccess, setClearSuccess] = useState(false);

  function closeClearModal() {
    setShowClearModal(false);
    setConfirmText("");
    setClearError(null);
  }

  async function handleClearData() {
    setClearing(true);
    setClearError(null);
    try {
      await clearOperationalData();
      setClearSuccess(true);
      closeClearModal();
    } catch (err) {
      setClearError("Failed to clear data. Admin role required.");
    } finally {
      setClearing(false);
    }
  }

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

      {isAdmin && (
        <div
          className="glass-card"
          style={{ maxWidth: 560, marginTop: 20, border: "1px solid var(--accent-red, #ef4444)" }}
        >
          <div className="card-title">
            <h2 style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent-red, #ef4444)" }}>
              <FiTrash2 /> Danger Zone
            </h2>
          </div>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 14 }}>
            Permanently deletes every incident, flow, prediction, and mitigation action from the
            database - useful for wiping accumulated test data before a live demo. This does NOT
            touch user accounts, roles, settings, or the registered ML model, so login and the
            active model keep working right after. This cannot be undone.
          </p>
          {clearSuccess && <div className="banner-success">Operational data cleared. Refresh the Dashboard to see it reset.</div>}
          <button
            className="btn-primary"
            style={{ background: "var(--accent-red, #ef4444)", borderColor: "var(--accent-red, #ef4444)" }}
            onClick={() => {
              setClearSuccess(false);
              setShowClearModal(true);
            }}
          >
            Clear All Detection Data
          </button>
        </div>
      )}

      {showClearModal && (
        <div className="modal-overlay" onClick={closeClearModal}>
          <div
            className="glass-card modal-pop"
            style={{ maxWidth: 440, width: "90%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 17, marginBottom: 10, color: "var(--accent-red, #ef4444)" }}>
              Clear all detection data?
            </h2>
            <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 14 }}>
              This permanently deletes every incident, flow, prediction, and mitigation action.
              Type <strong>{CONFIRM_PHRASE}</strong> below to confirm.
            </p>
            {clearError && <div className="banner-error">{clearError}</div>}
            <input
              type="text"
              className="field-input"
              style={{ width: "100%", marginBottom: 14 }}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              autoFocus
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-ghost" onClick={closeClearModal} disabled={clearing}>
                Cancel
              </button>
              <button
                className="btn-primary"
                style={{ background: "var(--accent-red, #ef4444)", borderColor: "var(--accent-red, #ef4444)" }}
                onClick={handleClearData}
                disabled={confirmText !== CONFIRM_PHRASE || clearing}
              >
                {clearing ? "Clearing..." : "Clear Everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
