import { getSession } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function evalCall<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getSession()?.token ?? '';
  const res = await fetch(`${API}/v1/developer/liveness-eval${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? body.error ?? res.statusText);
  return body as T;
}
