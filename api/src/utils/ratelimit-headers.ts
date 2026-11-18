import { Response } from 'express';

/**
 * IETF draft RateLimit headers, so integrators can back off before they hit a 429.
 * `limiter` is what rate-limiter-flexible returns from consume() (or throws on a rejection).
 */
export function setRateLimitHeaders(res: Response, limit: number, r: { remainingPoints?: number; msBeforeNext?: number }, rejected = false): void {
  const reset = Math.max(0, Math.ceil((r.msBeforeNext ?? 0) / 1000));
  res.setHeader('RateLimit-Limit', String(limit));
  res.setHeader('RateLimit-Remaining', String(Math.max(0, r.remainingPoints ?? 0)));
  res.setHeader('RateLimit-Reset', String(reset));
  if (rejected) res.setHeader('Retry-After', String(Math.max(1, reset)));
}
