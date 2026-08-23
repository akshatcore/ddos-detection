import api from "./api";

export type IncidentFlow = {
  id: number;
  src_ip: string;
  dst_ip: string;
  src_port: number | null;
  dst_port: number | null;
  protocol: string;
  packet_count: number;
  byte_count: number;
  packet_rate: number;
  flow_duration: number;
  created_at: string;
};

export type IncidentPrediction = {
  id: number;
  predicted_label: string;
  confidence: number;
  attack_probability: number;
  packet_rate: number;
  created_at: string;
};

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
  flow: IncidentFlow | null;
  prediction: IncidentPrediction | null;
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
