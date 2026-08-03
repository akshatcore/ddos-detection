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
  return response.data;
}
