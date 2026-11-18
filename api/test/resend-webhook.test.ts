process.env.AWS_ACCESS_KEY_ID ??= 'x'; process.env.AWS_SECRET_ACCESS_KEY ??= 'x'; process.env.S3_BUCKET_NAME ??= 'x';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import http from 'http';
import express, { Request } from 'express';
import * as db from '../src/db';
import { verifySvixSignature } from '../src/services/resend-webhook.service';
import webhooksRouter from '../src/routes/webhooks';

const SECRET_RAW = crypto.randomBytes(24);
const SECRET = 'whsec_' + SECRET_RAW.toString('base64');
const sign = (id: string, ts: number, body: string, key = SECRET_RAW) =>
  'v1,' + crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');

test('matches the published Svix test vector', () => {
  const body = '{"test": 2432232314}';
  const headers = { id: 'msg_p5jXN8AQM9LWM0D4loKWxJek', timestamp: '1614265330', signature: 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=' };
  assert.equal(verifySvixSignature(Buffer.from(body), headers, 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', 1614265330 * 1000), true);
});

test('signature rules: tamper, wrong key, stale, missing, rotation', () => {
  const now = Date.now(), ts = Math.floor(now / 1000), body = '{"a":1}';
  const good = sign('m1', ts, body);
  const h = (sig: string, t = ts) => ({ id: 'm1', timestamp: String(t), signature: sig });
  assert.equal(verifySvixSignature(Buffer.from(body), h(good), SECRET, now), true);
  assert.equal(verifySvixSignature(Buffer.from('{"a":2}'), h(good), SECRET, now), false);             // tampered body
  assert.equal(verifySvixSignature(Buffer.from(body), h(sign('m1', ts, body, crypto.randomBytes(24))), SECRET, now), false); // wrong key
  const old = ts - 3600;
  assert.equal(verifySvixSignature(Buffer.from(body), h(sign('m1', old, body), old), SECRET, now), false); // replay
  assert.equal(verifySvixSignature(Buffer.from(body), { id: 'm1', timestamp: String(ts) }, SECRET, now), false);
  assert.equal(verifySvixSignature(Buffer.from(body), h('v1,AAAA ' + good), SECRET, now), true);       // rotated: any match passes
  assert.equal(verifySvixSignature(Buffer.from(body), h(good), '', now), false);
});

test('route: verifies, records without raw email, dedupes, alerts, fails closed', async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  let seen = new Set<string>();
  (db as any).query = async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    const id = params[0] as string;
    if (seen.has(id)) return [];
    seen.add(id); return [{ id: 'row' }];
  };

  const alerts: string[] = [];
  const alertSrv = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { alerts.push(JSON.parse(b).text); res.end('ok'); }); });
  await new Promise<void>((r) => alertSrv.listen(0, r));
  process.env.ALERT_WEBHOOK_URL = `http://127.0.0.1:${(alertSrv.address() as any).port}/`;

  const app = express();
  app.use(express.json({ verify: (req, _r, buf) => { if ((req as Request).originalUrl?.startsWith('/webhooks/resend')) (req as any).rawBody = buf; } }));
  app.use('/webhooks', webhooksRouter);
  const srv = http.createServer(app); await new Promise<void>((r) => srv.listen(0, r));
  const url = `http://127.0.0.1:${(srv.address() as any).port}/webhooks/resend`;

  const event = { type: 'email.bounced', created_at: new Date().toISOString(),
    data: { email_id: 'em_1', to: ['someone.private@gmail.com'], subject: 'Your AfriVerify verification code', bounce: { type: 'Permanent', subType: 'General', message: 'mailbox does not exist' } } };
  const body = JSON.stringify(event);
  const post = (id: string, sig?: string, b = body, ts = Math.floor(Date.now() / 1000)) =>
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': String(ts), 'svix-signature': sig ?? sign(id, ts, b) }, body: b });

  // no secret configured -> fail closed
  delete process.env.RESEND_WEBHOOK_SECRET;
  assert.equal((await post('evt_0')).status, 503);
  process.env.RESEND_WEBHOOK_SECRET = SECRET;

  assert.equal((await post('evt_bad', 'v1,AAAA')).status, 401);
  assert.equal(calls.length, 0, 'nothing stored for a forged request');

  assert.equal((await post('evt_1')).status, 200);
  assert.equal(calls.length, 1);
  const flat = JSON.stringify(calls[0].params);
  assert.ok(!flat.includes('someone.private@gmail.com'), 'raw address must not be stored');
  assert.ok(flat.includes('so***@gmail.com'));
  assert.ok(flat.includes('Permanent') && flat.includes('mailbox does not exist'));

  assert.equal((await post('evt_1')).status, 200, 'retry of the same delivery is accepted');   // dedupe -> no 2nd alert
  assert.equal((await post('evt_2')).status, 200);                                             // same type inside cooldown -> no 2nd alert
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(alerts.length, 1, 'one alert, not one per event');
  assert.ok(alerts[0].includes('permanent bounce') && alerts[0].includes('so***@gmail.com') && !alerts[0].includes('someone.private'));

  // ignored event type is acknowledged but not stored
  const before = calls.length; const delivered = JSON.stringify({ type: 'email.delivered', data: {} });
  assert.equal((await post('evt_3', undefined, delivered)).status, 200);
  assert.equal(calls.length, before);

  srv.close(); alertSrv.close();
});
