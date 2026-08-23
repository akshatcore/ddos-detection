import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiSun, FiMoon, FiBell, FiSearch, FiLogOut } from "react-icons/fi";

import { useTheme } from "../theme/ThemeContext";
import { getStoredUser, logout } from "../services/auth";
import { getIncidents, type Incident } from "../services/incidents";

type TopbarProps = {
  title: string;
  section?: string;
  live?: boolean;
  onLogout: () => void;
};

function initialsFor(name: string | null, email: string) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function Topbar({ title, section = "Pages", live = false, onLogout }: TopbarProps) {
  const { mode, toggle } = useTheme();
  const navigate = useNavigate();
  const user = getStoredUser();

  const [search, setSearch] = useState("");
  const [bellOpen, setBellOpen] = useState(false);
  const [recent, setRecent] = useState<Incident[]>([]);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function openBell() {
    const next = !bellOpen;
    setBellOpen(next);
    if (next) {
      try {
        const data = await getIncidents();
        setRecent(data.slice(0, 4));
      } catch {
        setRecent([]);
      }
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    navigate(`/threat-hunting?q=${encodeURIComponent(search.trim())}`);
  }

  function handleLogout() {
    logout();
    onLogout();
  }

  const openCount = recent.filter((i) => i.status === "open").length;

  return (
    <header className="app-topbar">
      <div className="breadcrumb">
        {section}
        <strong>{title}</strong>
      </div>

      <div className="topbar-actions">
        {live && (
          <span className="live-pill">
            <span className="live-dot" />
            Live
          </span>
        )}

        <form onSubmit={handleSearch}>
          <div style={{ position: "relative" }}>
            <FiSearch
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
                fontSize: 14,
              }}
            />
            <input
              className="field-input"
              placeholder="Search incidents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 32, width: 190 }}
            />
          </div>
        </form>

        <button className="icon-btn" onClick={toggle} title="Toggle theme" type="button">
          {mode === "dark" ? <FiSun /> : <FiMoon />}
        </button>

        <div ref={bellRef} style={{ position: "relative" }}>
          <button className="icon-btn" onClick={openBell} title="Recent incidents" type="button">
            <FiBell />
          </button>
          {openCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: -3,
                right: -3,
                background: "var(--accent-red)",
                color: "white",
                fontSize: 10,
                fontWeight: 700,
                borderRadius: 999,
                minWidth: 16,
                height: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 3px",
              }}
            >
              {openCount}
            </span>
          )}
          {bellOpen && (
            <div
              className="glass-card"
              style={{
                position: "absolute",
                right: 0,
                top: 48,
                width: 280,
                padding: 14,
                zIndex: 20,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Recent incidents</div>
              {recent.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nothing to show yet.</div>
              ) : (
                recent.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: "8px 0",
                      borderBottom: "1px solid var(--divider)",
                      fontSize: 12.5,
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{item.title}</div>
                    <div style={{ color: "var(--text-muted)", marginTop: 2 }}>
                      {new Date(item.created_at).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <button className="icon-btn" onClick={handleLogout} title="Log out" type="button">
          <FiLogOut />
        </button>

        <div className="avatar" title={user?.email || ""}>
          {initialsFor(user?.full_name || null, user?.email || "??")}
        </div>
      </div>
    </header>
  );
}
