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

async function requestAuth<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  return request<T>(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers ?? {}) },
  });
}

export const api = {
  get:       <T>(path: string)                           => request<T>(path),
  post:      <T>(path: string, data: unknown)            => request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  getAuth:   <T>(path: string, token: string)            => requestAuth<T>(path, token),
  postAuth:  <T>(path: string, data: unknown, token: string) => requestAuth<T>(path, token, { method: 'POST', body: JSON.stringify(data) }),
  patchAuth: <T>(path: string, data: unknown, token: string) => requestAuth<T>(path, token, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAuth:<T>(path: string, token: string)            => requestAuth<T>(path, token, { method: 'DELETE' }),
};
