import api from "./api";

// Mirrors backend IncidentRead schema (backend/app/schemas.py) exactly -
// no fields invented on the frontend that the backend doesn't actually return.
export type Incident = {
  id: number;
  flow_id: number | null;
  prediction_id: number | null;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type MitigationAction = {
  id: number;
  action_type: string;
  command: string;
  status: string;
  created_at: string;
};

export async function getIncidents(): Promise<Incident[]> {
  const response = await api.get<Incident[]>("/incidents");
  return response.data;
}

export async function mitigateIncident(incidentId: number): Promise<MitigationAction[]> {
  const response = await api.post<MitigationAction[]>(`/incidents/${incidentId}/mitigate`);
  return response.data;
}
