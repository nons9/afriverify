import redis from '../redis';

/**
 * Fixed-window counter shared by every replica. Returns true while `id` is within `max` hits in the current
 * `windowSeconds` window. Fails CLOSED: if Redis is unavailable the answer is "no", because this guards actions
 * that move money or reveal whether a secret code is valid.
 */
export async function withinLimit(scope: string, id: string, max: number, windowSeconds: number, now = Date.now()): Promise<boolean> {
  try {
    const key = `wl:${scope}:${id}:${Math.floor(now / (windowSeconds * 1000))}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowSeconds + 30);
    return n <= max;
  } catch {
    return false;
  }
}
