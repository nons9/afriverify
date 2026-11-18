/**
 * Cross-replica guard for in-process timer jobs (billing, AML re-screen, alerting, retention).
 * Every API replica runs its own setInterval; without this each replica would run each job.
 *
 * The first replica to fire inside an interval wins a Redis lock (SET NX EX) that is held for
 * ~90% of the interval and deliberately NOT released afterwards, so a replica whose timer fires
 * later in the same interval skips. If Redis is unreachable we skip the run (fail closed): a missed
 * run is retried next interval, a duplicated billing/AML run is not harmless.
 */
import { randomUUID } from 'crypto';
import redis from '../redis';
import logger from './logger';

export async function runOncePerInterval(
  name: string,
  intervalMs: number,
  job: () => Promise<unknown>
): Promise<boolean> {
  const ttlSeconds = Math.max(30, Math.floor((intervalMs * 0.9) / 1000));
  try {
    const got = await redis.set(`job-lock:${name}`, randomUUID(), 'EX', ttlSeconds, 'NX');
    if (got !== 'OK') {
      logger.debug('Job skipped: another replica already ran it this interval', { job: name });
      return false;
    }
  } catch (err) {
    logger.warn('Job skipped: could not acquire lock (Redis unavailable)', { job: name, error: (err as Error).message });
    return false;
  }
  await job();
  return true;
}
