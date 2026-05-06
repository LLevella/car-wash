export type ApiEnvelope<T> = {
  data: T;
};

export type ApiErrorBody = {
  detail?: string | string[] | Record<string, string[]>;
  field_errors?: Record<string, string[]>;
  [field: string]: unknown;
};

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody | null;

  constructor(message: string, status: number, body: ApiErrorBody | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const csrfToken = getCookie("csrftoken");
  if (csrfToken && unsafeMethods.has(method)) {
    headers.set("X-CSRFToken", csrfToken);
  }

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...options,
    method,
    headers,
    credentials: "include",
  });

  const body = await parseJson<ApiEnvelope<T> | ApiErrorBody>(response);

  if (!response.ok) {
    const errorBody = isObject(body) ? (body as ApiErrorBody) : null;
    throw new ApiError(readErrorMessage(errorBody), response.status, errorBody);
  }

  if (isEnvelope<T>(body)) {
    return body.data;
  }

  return body as T;
}

export function apiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL ?? "";
}

async function parseJson<T>(response: Response): Promise<T | null> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  return JSON.parse(text) as T;
}

function isEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  return isObject(value) && "data" in value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readErrorMessage(body: ApiErrorBody | null) {
  if (!body?.detail) {
    return "Запрос завершился ошибкой.";
  }

  if (typeof body.detail === "string") {
    return body.detail;
  }

  if (Array.isArray(body.detail)) {
    return body.detail.join(" ");
  }

  return "Проверьте поля формы.";
}

function getCookie(name: string) {
  return document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split("=")[1];
}
