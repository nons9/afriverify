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

export interface Rate { k: number; n: number; rate: number | null; low: number | null; high: number | null }
export interface Quota { have: number; target: number }
export interface Coverage {
  genuine: { total: Quota; by_skin_group: Record<string, Quota>; by_lighting: Record<string, Quota>; devices: Quota };
  attacks: Record<string, { count: Quota; lightings: Quota; devices: Quota }>;
  next_up: { text: string; shortfall: number }[];
  complete: boolean;
}
export interface Metrics {
  totals: { genuine: number; attacks: number };
  bpcer: { strict: Rate; hard: Rate };
  apcer: { overall: Rate; by_attack_type: Record<string, Rate>; worst_attack_type: string | null };
  by_skin_group: Record<string, { genuine: number; bpcer_strict: Rate; bpcer_hard: Rate }>;
  by_lighting: Record<string, { genuine: number; attacks: number; bpcer_strict: Rate; apcer: Rate }>;
  by_profile: Record<string, { genuine: number; attacks: number; bpcer_strict: Rate; apcer: Rate }>;
  flash: { genuine: Record<string, number>; attacks: Record<string, number> };
  adequacy: { ok: boolean; notes: string[] };
}
export interface MetricsResponse {
  study: { id: string; name: string; purpose: string; retention_days: number; status: string; consent_version: string };
  metrics: Metrics; coverage: Coverage; period: { from: string | null; to: string | null };
  participants_with_captures: number; distinct_devices: number;
}
