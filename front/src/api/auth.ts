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

export function logout() {
  return apiRequest<void>("/api/auth/logout/", {
    method: "POST",
  });
}

export function ensureCsrfCookie() {
  return apiRequest<void>("/api/auth/csrf/");
}
