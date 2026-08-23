import api from "./api";

// Mirrors backend GET /system/status exactly - real, live values read from
// the running process/DB engine, nothing hardcoded on the frontend.
export type SystemStatus = {
  app_name: string;
  environment: string;
  database: {
    dialect: string;
    driver: string;
    provider: string;
    connected: boolean;
  };
  server_time: string;
  uptime_seconds: number;
};

export async function getSystemStatus(): Promise<SystemStatus> {
  const response = await api.get<SystemStatus>("/system/status");
  return response.data;
}
