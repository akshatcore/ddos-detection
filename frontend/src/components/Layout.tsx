import { Outlet, useLocation } from "react-router-dom";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const PAGE_META: Record<string, { title: string; live?: boolean }> = {
  "/": { title: "Dashboard", live: true },
  "/analytics": { title: "Analytics" },
  "/incidents": { title: "Incidents", live: true },
  "/threat-hunting": { title: "Threat Hunting", live: true },
  "/reports": { title: "Reports" },
  "/settings": { title: "Settings" },
};

export function Layout({ onLogout }: { onLogout: () => void }) {
  const location = useLocation();
  const meta = PAGE_META[location.pathname] || { title: "DDoS SOC" };

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-content">
        <Topbar title={meta.title} live={meta.live} onLogout={onLogout} />
        <main className="app-body">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
