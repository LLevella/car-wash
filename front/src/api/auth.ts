import { apiRequest } from "./client";
import type { CurrentUser } from "./types";

export function getCurrentUser() {
  return apiRequest<CurrentUser>("/api/auth/me/");
}

export function login(username: string, password: string) {
  return apiRequest<CurrentUser>("/api/auth/login/", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export type RegisterPayload = {
  username: string;
  password: string;
  password_confirm: string;
  name: string;
  phone_number: string;
};

export function registerCustomer(payload: RegisterPayload) {
  return apiRequest<CurrentUser>("/api/auth/register/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logout() {
  return apiRequest<CurrentUser>("/api/auth/logout/", {
    method: "POST",
  });
}

export function ensureCsrfCookie() {
  return apiRequest<{ csrf_token: string }>("/api/auth/csrf/");
}
