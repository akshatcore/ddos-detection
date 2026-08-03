import api from "./api";

export type UserRole = {
  id: number;
  name: string;
  description: string | null;
};

export type CurrentUser = {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
  role: UserRole;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
  expires_at: string;
  user: CurrentUser;
};

// Matches backend LoginRequest / TokenResponse schemas exactly
// (backend/app/schemas.py) - no invented fields.
export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>("/auth/login", { email, password });
  localStorage.setItem("access_token", response.data.access_token);
  localStorage.setItem("user", JSON.stringify(response.data.user));
  return response.data;
}

export function logout() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("user");
}

export function getStoredUser(): CurrentUser | null {
  const raw = localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

export function isAuthenticated(): boolean {
  return Boolean(localStorage.getItem("access_token"));
}
