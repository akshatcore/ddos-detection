import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Log from "./pages/log";
import Dashboard from "./pages/Dashboard";
import Analytics from "./pages/Analytics";
import Reports from "./pages/Reports";
import Incidents from "./pages/Incidents";
import ThreatHunting from "./pages/ThreatHunting";
import Settings from "./pages/Settings";
import { isAuthenticated } from "./services/auth";

function App() {
  // Checks for a real stored token on load instead of always starting
  // logged out - so a page refresh doesn't kick the user back to login.
  const [loggedIn, setLoggedIn] = useState(isAuthenticated());

  return (
    <BrowserRouter>
      {loggedIn ? (
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/incidents" element={<Incidents />} />
          <Route path="/threat-hunting" element={<ThreatHunting />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      ) : (
        <Log onLogin={() => setLoggedIn(true)} />
      )}
    </BrowserRouter>
  );
}

export default App;
