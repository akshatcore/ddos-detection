import api from "./api";

// Mirrors backend ReportSummary schema exactly.
export type ReportSummary = {
  users: number;
  flows: number;
  predictions: number;
  incidents: number;
  open_incidents: number;
  mitigations: number;
  active_models: number;
};

export async function getReportSummary(): Promise<ReportSummary> {
  const response = await api.get<ReportSummary>("/reports");
  return response.data;
}

// Mirrors backend GET /reports/mitigations exactly - real counts grouped
// by action_type, plus the most recent actions taken.
export type MitigationBreakdown = {
  by_type: Record<string, number>;
  total: number;
  recent: {
    id: number;
    action_type: string;
    command: string;
    status: string;
    created_at: string;
  }[];
};

export async function getMitigationBreakdown(): Promise<MitigationBreakdown> {
  const response = await api.get<MitigationBreakdown>("/reports/mitigations");
  return response.data;
}
