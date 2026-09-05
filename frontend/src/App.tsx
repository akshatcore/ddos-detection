import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Log from "./pages/log";
import Dashboard from "./pages/Dashboard";
import Analytics from "./pages/Analytics";
import Reports from "./pages/Reports";
import Incidents from "./pages/Incidents";
import ThreatHunting from "./pages/ThreatHunting";
import Settings from "./pages/Settings";
import { Layout } from "./components/Layout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { isAuthenticated } from "./services/auth";

function App() {
  // Checks for a real stored token on load instead of always starting
  // logged out - so a page refresh doesn't kick the user back to login.
  const [loggedIn, setLoggedIn] = useState(isAuthenticated());

  // A session can expire mid-use (JWT session_timeout_minutes elapses, or
  // the backend restarts with a rotated JWT_SECRET_KEY - both real cases in
  // this project). api.ts's response interceptor catches the resulting 401,
  // clears localStorage, and fires this event - without listening for it,
  // `loggedIn` (set once, above, on mount) would never learn the session
  // ended, and every route would keep rendering as if still authenticated
  // while silently failing every request underneath.
  useEffect(() => {
    function handleExpired() {
      setLoggedIn(false);
    }
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        {loggedIn ? (
          <Routes>
            <Route element={<Layout onLogout={() => setLoggedIn(false)} />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/incidents" element={<Incidents />} />
              <Route path="/threat-hunting" element={<ThreatHunting />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Routes>
        ) : (
          <Log onLogin={() => setLoggedIn(true)} />
        )}
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
