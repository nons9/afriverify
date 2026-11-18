process.env.AWS_ACCESS_KEY_ID ??= 'x'; process.env.AWS_SECRET_ACCESS_KEY ??= 'x'; process.env.S3_BUCKET_NAME ??= 'x';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import redis from '../src/redis';
import * as db from '../src/db';
import { claimCooldown, evaluateHttpHealth, sumMetric, incrMetric } from '../src/utils/metrics';
import { getMigrationStatus } from '../src/db/migration-status';

const CFG = { minRequests: 20, errorRate: 0.1, engineErrorThreshold: 3 };

test('5xx alert needs BOTH enough traffic and a high error rate (no paging on 1 failed request of 2)', () => {
  assert.deepEqual(evaluateHttpHealth({ total: 2, errors: 2, engineErrors: 0 }, CFG), []);
  assert.deepEqual(evaluateHttpHealth({ total: 100, errors: 5, engineErrors: 0 }, CFG), []);
  const a = evaluateHttpHealth({ total: 100, errors: 10, engineErrors: 0 }, CFG);
  assert.equal(a.length, 1);
  assert.equal(a[0].key, 'http-5xx');
  assert.match(a[0].message, /10%.*10\/100/);
});

test('liveness engine failures alert independently of overall traffic', () => {
  const a = evaluateHttpHealth({ total: 0, errors: 0, engineErrors: 3 }, CFG);
  assert.equal(a.length, 1);
  assert.equal(a[0].key, 'liveness-engine');
  assert.deepEqual(evaluateHttpHealth({ total: 0, errors: 0, engineErrors: 2 }, CFG), []);
  assert.equal(evaluateHttpHealth({ total: 50, errors: 25, engineErrors: 9 }, CFG).length, 2);
});

test('cooldown: first caller wins across replicas, the rest are suppressed; Redis outage fails OPEN (alert still sent)', async () => {
  const seen = new Set<string>();
  (redis as any).set = async (k: string, _v: string, _ex: string, _ttl: number, nx: string) => {
    if (nx === 'NX' && seen.has(k)) return null;
    seen.add(k); return 'OK';
  };
  const results = await Promise.all([1, 2, 3].map(() => claimCooldown('incident', 600)));
  assert.equal(results.filter(Boolean).length, 1);
  (redis as any).set = async () => { throw new Error('ECONNREFUSED'); };
  assert.equal(await claimCooldown('other', 600), true);
});

test('metrics sum the last N minute-buckets and never throw when Redis is down', async () => {
  const now = Date.UTC(2026, 10, 18, 12, 30, 0);
  const m = Math.floor(now / 60_000);
  const store: Record<string, string> = { [`metric:http_5xx:${m}`]: '4', [`metric:http_5xx:${m - 3}`]: '6', [`metric:http_5xx:${m - 20}`]: '99' };
  (redis as any).mget = async (...keys: string[]) => keys.map((k) => store[k] ?? null);
  assert.equal(await sumMetric('http_5xx', 10, now), 10);          // minute -20 is outside the window
  (redis as any).multi = () => { throw new Error('ECONNREFUSED'); };
  await assert.doesNotReject(incrMetric('http_total'));
});

test('readiness: reports pending migrations so an unmigrated build is never promoted', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  for (const f of ['001_a.sql', '002_b.sql', '003_c.sql']) fs.writeFileSync(path.join(dir, f), '-- noop');
  (db as any).query = async () => [{ version: '001_a' }, { version: '002_b' }];
  const s = await getMigrationStatus(dir);
  assert.deepEqual({ expected: s.expected, applied: s.applied, current: s.current, pending: s.pending }, { expected: 3, applied: 2, current: false, pending: ['003_c'] });
  (db as any).query = async () => [{ version: '001_a' }, { version: '002_b' }, { version: '003_c' }];
  assert.equal((await getMigrationStatus(dir)).current, true);
});
