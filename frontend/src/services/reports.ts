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
