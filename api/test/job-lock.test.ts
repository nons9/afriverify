// Two "replicas" firing the same job in the same interval must only run it once.
process.env.REDIS_URL ??= 'redis://localhost:6379';
import test from 'node:test';
import assert from 'node:assert/strict';
import redis from '../src/redis';
import { runOncePerInterval } from '../src/utils/job-lock';

test('only one replica runs a job per interval; Redis outage skips (fails closed)', async (t) => {
  const store = new Map<string, string>();
  (redis as any).set = async (k: string, v: string, _ex: string, _ttl: number, nx: string) => {
    if (nx === 'NX' && store.has(k)) return null;
    store.set(k, v); return 'OK';
  };
  let runs = 0;
  const job = async () => { runs++; };
  const results = await Promise.all([1, 2, 3].map(() => runOncePerInterval('t', 60_000, job)));
  assert.equal(runs, 1);
  assert.deepEqual(results.filter(Boolean).length, 1);

  (redis as any).set = async () => { throw new Error('ECONNREFUSED'); };
  assert.equal(await runOncePerInterval('t2', 60_000, job), false);
  assert.equal(runs, 1);
  t.diagnostic('ok');
});
