import api from "./api";

// Mirrors backend ModelVersionRead schema exactly.
export type ModelVersion = {
  id: number;
  name: string;
  version: string;
  artifact_path: string;
  sha256: string | null;
  metrics: Record<string, unknown> | null;
  is_active: boolean;
  deployed_at: string | null;
  created_at: string;
};

export async function getModels(): Promise<ModelVersion[]> {
  const response = await api.get<ModelVersion[]>("/models");
  // Defensive: every caller does `.find(...)` on this immediately. The
  // backend always returns a real array on success, but guarding here once
  // means a malformed/unexpected response degrades to "no models" instead
  // of crashing every page that shows model info (Dashboard, Analytics,
  // SidebarStatus all call this).
  return Array.isArray(response.data) ? response.data : [];
}
