/**
 * Tiny cross-replica metrics + alert-cooldown helpers, backed by Redis (so 2+ API replicas share one view).
 * Counters are per-minute buckets that expire after an hour. Nothing here may ever break a request.
 */
import redis from '../redis';

const BUCKET_TTL_SECONDS = 60 * 60;
const minuteOf = (t: number) => Math.floor(t / 60_000);
const bucketKey = (name: string, minute: number) => `metric:${name}:${minute}`;

export async function incrMetric(name: string, by = 1, now = Date.now()): Promise<void> {
  try {
    const k = bucketKey(name, minuteOf(now));
    await redis.multi().incrby(k, by).expire(k, BUCKET_TTL_SECONDS).exec();
  } catch {
    /* metrics are best-effort */
  }
}

/** Sum of a counter over the last `minutes` minutes (including the current one). */
export async function sumMetric(name: string, minutes: number, now = Date.now()): Promise<number> {
  const m = minuteOf(now);
  const keys = Array.from({ length: minutes }, (_, i) => bucketKey(name, m - i));
  const values = await redis.mget(...keys);
  return values.reduce((acc, v) => acc + (v ? parseInt(v, 10) || 0 : 0), 0);
}

/**
 * True for the FIRST caller inside `ttlSeconds`, false for everyone else on any replica. Used so one incident
 * pages once, not once per replica or once per interval. If Redis is down we return true: an alert that might
 * repeat is better than a swallowed one.
 */
export async function claimCooldown(name: string, ttlSeconds: number): Promise<boolean> {
  try {
    return (await redis.set(`cooldown:${name}`, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
  } catch {
    return true;
  }
}

export interface HttpHealthInput {
  total: number;
  errors: number;
  engineErrors: number;
}
export interface HttpHealthConfig {
  minRequests: number;
  errorRate: number;
  engineErrorThreshold: number;
}

/** Pure decision logic (unit-tested): which alerts, if any, does this window warrant? */
export function evaluateHttpHealth(i: HttpHealthInput, c: HttpHealthConfig): { key: string; message: string }[] {
  const out: { key: string; message: string }[] = [];
  if (i.total >= c.minRequests && i.errors / i.total >= c.errorRate) {
    out.push({
      key: 'http-5xx',
      message: `AfriVerify API: ${(100 * i.errors / i.total).toFixed(0)}% of requests failed with 5xx (${i.errors}/${i.total} in the last 10 minutes).`,
    });
  }
  if (i.engineErrors >= c.engineErrorThreshold) {
    out.push({
      key: 'liveness-engine',
      message: `AfriVerify: the liveness engine was unreachable or errored ${i.engineErrors} times in the last 10 minutes. Live scans are failing (503) and users cannot complete verification.`,
    });
  }
  return out;
}
