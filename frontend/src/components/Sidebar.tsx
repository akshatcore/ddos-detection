import { NavLink } from "react-router-dom";
import {
  FiShield,
  FiHome,
  FiPieChart,
  FiAlertTriangle,
  FiCrosshair,
  FiFileText,
  FiSettings,
  FiBookOpen,
} from "react-icons/fi";

import { SidebarStatus } from "./SidebarStatus";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: <FiHome /> },
  { to: "/analytics", label: "Analytics", icon: <FiPieChart /> },
  { to: "/incidents", label: "Incidents", icon: <FiAlertTriangle /> },
  { to: "/threat-hunting", label: "Threat Hunting", icon: <FiCrosshair /> },
  { to: "/reports", label: "Reports", icon: <FiFileText /> },
];

export function Sidebar() {
  return (
    <aside className="app-sidebar">
      <div className="brand">
        <span className="brand-badge">
          <FiShield />
        </span>
        DDoS SOC
      </div>

      <div className="nav-section-label">Monitoring</div>
      <ul className="nav-list">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            >
              {item.icon}
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="nav-section-label">Account</div>
      <ul className="nav-list">
        <li>
          <NavLink to="/settings" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
            <FiSettings />
            Settings
          </NavLink>
        </li>
      </ul>

      <SidebarStatus />

      <div className="help-card">
        <h4>Need help?</h4>
        <p>Check the project README for setup, attack simulation, and API docs.</p>
        <a href="#" onClick={(e) => e.preventDefault()}>
          <FiBookOpen style={{ marginRight: 6, verticalAlign: -2 }} />
          Documentation
        </a>
      </div>
    </aside>
  );
}
