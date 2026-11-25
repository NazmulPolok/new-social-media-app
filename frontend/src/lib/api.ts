export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

export function resolveMediaUrl(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("/uploads/")) return `${API_BASE}${url}`;
  return url;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("nexushub_token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem("nexushub_token", token);
  } else {
    localStorage.removeItem("nexushub_token");
  }
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errData.detail || `Request failed (${res.status})`);
  }
  return res.json();
}
