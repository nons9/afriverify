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

import { sendOpsAlert, warnIfNoAlertChannel } from '../src/services/alerting.service';

test('ops alert reaches the webhook AND the email channel when both are configured', async () => {
  const hooks: string[] = []; const mails: any[] = [];
  const out = await sendOpsAlert('engine down', {
    env: { ALERT_WEBHOOK_URL: 'https://hooks.test/x', ALERT_EMAIL_TO: 'a@x.test, b@x.test', RESEND_API_KEY: 'k', RESEND_FROM_EMAIL: 'AfriVerify <ops@x.test>' } as any,
    fetchImpl: (async (_u: any, init: any) => { hooks.push(JSON.parse(init.body).text); return { ok: true, status: 200 } as Response; }) as any,
    emailSender: async (o) => { mails.push(o); },
  });
  assert.deepEqual(out, { webhook: 'sent', email: 'sent' });
  assert.deepEqual(hooks, ['engine down']);
  assert.deepEqual(mails[0].to, ['a@x.test', 'b@x.test']);
  assert.match(mails[0].subject, /engine down/);
});

test('email alone is enough, and a failing channel is reported without throwing', async () => {
  const out = await sendOpsAlert('x', { env: { ALERT_EMAIL_TO: 'a@x.test', RESEND_API_KEY: 'k', RESEND_FROM_EMAIL: 'f@x.test' } as any, emailSender: async () => { throw new Error('boom'); } });
  assert.deepEqual(out, { webhook: 'not_configured', email: 'failed' });
  const hookFail = await sendOpsAlert('x', { env: { ALERT_WEBHOOK_URL: 'https://h.test' } as any, fetchImpl: (async () => ({ ok: false, status: 500 })) as any });
  assert.equal(hookFail.webhook, 'failed');
});

test('with no channel configured the alert is reported as not delivered and boot warns', async () => {
  assert.deepEqual(await sendOpsAlert('x', { env: {} as any }), { webhook: 'not_configured', email: 'not_configured' });
  assert.equal(warnIfNoAlertChannel({} as any), false);
  assert.equal(warnIfNoAlertChannel({ ALERT_WEBHOOK_URL: 'https://h.test' } as any), true);
  assert.equal(warnIfNoAlertChannel({ ALERT_EMAIL_TO: 'a@x.test', RESEND_API_KEY: 'k' } as any), false, 'email also needs a from address');
});
