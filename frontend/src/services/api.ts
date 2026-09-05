import axios from "axios";

// Base URL comes from environment config, never hardcoded, so the same
// build can point at localhost during development or a real server in
// production just by changing .env - see .env.example
const API_URL = import.meta.env.VITE_API_URL as string;

export const api = axios.create({
  baseURL: API_URL,
  // Without this, a hung/unreachable backend (server down, wrong URL, dead
  // network) leaves a request pending forever - the browser has no default
  // timeout of its own. 15s is generous enough for a slow LAN/VM host-only
  // adapter but still turns "hangs forever" into a real, catchable error.
  timeout: 15000,
});

// Attach the JWT token (if present) to every outgoing request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If the backend ever responds 401 (token expired/invalid - e.g. the
// session_timeout_minutes window passed, or the backend was restarted with
// a rotated JWT_SECRET_KEY), clear the stored session so the app falls back
// to the login screen instead of silently failing every subsequent request.
//
// Clearing localStorage alone is NOT enough: App.tsx's `loggedIn` state is
// only read from localStorage once, on mount (see useState(isAuthenticated())
// there) - it never re-checks afterward. Without this event, a session that
// expires mid-use leaves the user stranded on a fully-rendered but
// permanently-broken authenticated page, watching every request fail,  with
// no way back to the login screen short of a manual page refresh. This
// event is how the interceptor (which has no access to React state) tells
// App.tsx to actually flip back to the login screen.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("user");
      window.dispatchEvent(new Event("auth:expired"));
    }
    return Promise.reject(error);
  }
);

export default api;
