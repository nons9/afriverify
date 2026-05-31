import { getToken } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
    throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  get:  <T>(path: string)             => request<T>(path),
  post: <T>(path: string, data: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  auth: {
    get:    <T>(path: string)              => request<T>(path, { headers: authHeaders() }),
    post:   <T>(path: string, data: unknown) => request<T>(path, { method: 'POST',   body: JSON.stringify(data), headers: authHeaders() }),
    patch:  <T>(path: string, data: unknown) => request<T>(path, { method: 'PATCH',  body: JSON.stringify(data), headers: authHeaders() }),
    delete: <T>(path: string)              => request<T>(path, { method: 'DELETE', headers: authHeaders() }),
  },
};
