// Deliberately separate from lib/auth.ts's developer session: a different
// person (the identity owner, not a platform's developer) with a different
// token, so the two can never be confused or leak into each other's requests.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export function getIdentityToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('av_identity_token');
}

export function setIdentitySession(token: string): void {
  localStorage.setItem('av_identity_token', token);
  document.cookie = 'av_identity_session=1; path=/; SameSite=Lax; max-age=2592000';
}

export function clearIdentitySession(): void {
  localStorage.removeItem('av_identity_token');
  document.cookie = 'av_identity_session=; path=/; SameSite=Lax; max-age=0';
}

async function identityRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getIdentityToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) ?? {})
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw Object.assign(new Error(body.message ?? res.statusText), { status: res.status });
  }
  return res.json() as Promise<T>;
}

export const identityApi = {
  get: <T>(path: string) => identityRequest<T>(path),
  post: <T>(path: string, data: unknown) => identityRequest<T>(path, { method: 'POST', body: JSON.stringify(data) })
};
