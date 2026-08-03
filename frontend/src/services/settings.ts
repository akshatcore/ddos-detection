import api from "./api";

// Mirrors backend SettingsRead / SettingsUpdate schemas exactly - these are
// the ONLY settings the backend actually persists and exposes.
export type Settings = {
  confidence_threshold: number;
  packet_rate_threshold: number;
  session_timeout_minutes: number;
  mitigation_interface: string;
};

export async function getSettings(): Promise<Settings> {
  const response = await api.get<Settings>("/settings");
  return response.data;
}

export async function updateSettings(payload: Partial<Settings>): Promise<Settings> {
  const response = await api.put<Settings>("/settings", payload);
  return response.data;
}
