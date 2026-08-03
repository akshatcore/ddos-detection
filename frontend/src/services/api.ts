import axios from "axios";

// Base URL comes from environment config, never hardcoded, so the same
// build can point at localhost during development or a real server in
// production just by changing .env - see .env.example
const API_URL = import.meta.env.VITE_API_URL as string;

export const api = axios.create({
  baseURL: API_URL,
});

// Attach the JWT token (if present) to every outgoing request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If the backend ever responds 401 (token expired/invalid), clear the
// stored session so the app falls back to the login screen instead of
// silently failing every subsequent request
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("user");
    }
    return Promise.reject(error);
  }
);

export default api;
