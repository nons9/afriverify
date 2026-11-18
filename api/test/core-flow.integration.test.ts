// DB- and Redis-backed tests of the paths that handle trust and money: one-time codes and subscription payments.
// Skipped unless BOTH are provided (a Postgres SERVER url, and Redis):
//   TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/postgres REDIS_URL=redis://localhost:6379 npm test
// The test creates its own throwaway database, runs the real migrations on it, and drops it afterwards.
// Only the SMS provider and the payment provider's own confirmation call are stubbed.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { spawn } from 'child_process';
import http from 'http';
import { randomBytes, createHash } from 'crypto';
import { Client } from 'pg';

const SERVER = process.env.TEST_DATABASE_URL;
const REDIS = process.env.REDIS_URL;
const skip = (!SERVER || !REDIS) && 'set TEST_DATABASE_URL (a Postgres server) and REDIS_URL to run';
const DB_NAME = `core_flow_${randomBytes(4).toString('hex')}`;

let base = '';
let server: http.Server;
let admin: Client;
let db: Client;
let axiosMod: any;
let fwMod: any;

const lastSms = new Map<string, string>();        // phone -> last OTP
let payingAmount = 4900, payingCurrency = 'USD', payingStatus = 'successful';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const KEY = `av_live_coreflow_${randomBytes(6).toString('hex')}`;
let keyId = '';

before(async () => {
  if (skip) return;
  admin = new Client({ connectionString: SERVER });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${DB_NAME}`);
  const dbUrl = new URL(SERVER!); dbUrl.pathname = `/${DB_NAME}`;
  process.env.DATABASE_URL = dbUrl.toString();
  process.env.NODE_ENV = 'test';
  process.env.AFRICASTALKING_API_KEY = 'k'; process.env.AFRICASTALKING_USERNAME = 'u';
  process.env.FLUTTERWAVE_SECRET_HASH = 'whsec_test_hash';
  process.env.IDENTITY_SESSION_JWT_SECRET = 'portal-test-secret';

  const code = await new Promise<number>((resolve) => {
    const p = spawn(process.execPath, ['--require', 'ts-node/register/transpile-only', path.join(__dirname, '..', 'src', 'db', 'migrate.ts')], { env: process.env, stdio: 'ignore' });
    p.on('exit', (c) => resolve(c ?? 1));
  });
  assert.equal(code, 0, 'migrations apply on the throwaway database');

  db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const k = await db.query(
    `INSERT INTO api_keys (platform_name, platform_email, api_key_hash, api_key_prefix, permissions, tier, monthly_limit)
     VALUES ('CoreFlow', 'core@flow.test', $1, 'av_live_core', '["verify"]', 'free', 100) RETURNING id`, [sha(KEY)]
  );
  keyId = k.rows[0].id;

  // stub the SMS provider (axios) and the payment provider's confirmation call
  axiosMod = (await import('axios')).default;
  axiosMod.post = async (_url: string, body: URLSearchParams | Record<string, unknown>) => {
    const p = body instanceof URLSearchParams ? Object.fromEntries(body) : (body as Record<string, string>);
    const m = /\b(\d{6})\b/.exec(String(p.message ?? p.sms ?? ''));
    if (m) lastSms.set(String(p.to), m[1]);
    return { data: { SMSMessageData: { Recipients: [{ status: 'Success' }] }, code: 'ok' } };
  };
  fwMod = await import('../src/services/flutterwave.service');
  (fwMod as any).verifyTransactionByReference = async (reference: string) => ({ status: payingStatus, amount: payingAmount / 100, currency: payingCurrency, reference });

  const express = (await import('express')).default;
  const { toClientError } = await import('../src/utils/http-errors');
  const verifyRouter = (await import('../src/routes/verify')).default;
  const hostedRouter = (await import('../src/routes/hosted')).default;
  const billingRouter = (await import('../src/routes/billing')).default;
  const portalRouter = (await import('../src/routes/identity-portal')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1/verify', verifyRouter);
  app.use('/v1/hosted', hostedRouter);
  app.use('/v1/developer/billing', billingRouter);
  app.use('/v1/identity-portal', portalRouter);
  app.use((err: Error, _req: any, res: any, _next: any) => {
    const c = toClientError(err);
    if (c) { res.status(c.status).json({ error: c.error }); return; }
    res.status(500).json({ error: 'internal_error', message: err.message });
  });
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});

after(async () => {
  if (skip) return;
  server?.close();
  try { const redis = (await import('../src/redis')).default; redis.disconnect(); } catch { /* ignore */ }
  try { const pool = (await import('../src/db')).default; await pool.end(); } catch { /* ignore */ }
  await db?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  await admin?.end();
});

const api = (p: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }).then(async (r) => ({ s: r.status, j: await r.json() as any }));
const auth = { authorization: `Bearer ${KEY}`, 'x-platform': 'CoreFlow' };
let phoneSeq = 0;
const newPhone = () => `+2335${String(70000000 + (++phoneSeq) + Math.floor(Math.random() * 1000) * 1000).slice(-8)}`;

/** initiate + send a code through the given channel ('verify' for API, 'hosted' for the hosted page). Returns what a test needs. */
async function startOtp(channel: 'verify' | 'hosted' = 'verify') {
  const phone = newPhone();
  const init = await api('/v1/verify/initiate', { phone }, auth);
  assert.equal(init.s, 201, JSON.stringify(init.j));
  const token = init.j.session_token as string;
  const send = channel === 'verify' ? await api('/v1/verify/otp/send', { session_token: token }, auth) : await api('/v1/hosted/otp/send', { session_token: token });
  assert.equal(send.s, 200, JSON.stringify(send.j));
  const code = lastSms.get(phone)!;
  assert.match(code, /^\d{6}$/);
  const wrong = code === '000000' ? '111111' : '000000';
  return { phone, token, code, wrong, confirm: (otp: string) => (channel === 'verify' ? api('/v1/verify/otp/confirm', { session_token: token, otp }, auth) : api('/v1/hosted/otp/confirm', { session_token: token, otp })) };
}

// ─── one-time codes ──────────────────────────────────────────────────────────────

test('the right code confirms and a first-time person moves on to the ID step', { skip, timeout: 60_000 }, async () => {
  const s = await startOtp();
  const r = await s.confirm(s.code);
  assert.equal(r.s, 200, JSON.stringify(r.j));
  assert.equal(r.j.confirmed, true);
  assert.equal(r.j.next_step, 'id_upload');
});

test('three wrong codes lock the session; even the right code is then refused', { skip, timeout: 60_000 }, async () => {
  const s = await startOtp();
  const a = await s.confirm(s.wrong), b = await s.confirm(s.wrong), c = await s.confirm(s.wrong);
  assert.deepEqual([a.j.attempts_remaining, b.j.attempts_remaining, c.j.attempts_remaining], [2, 1, 0]);
  const late = await s.confirm(s.code);
  assert.equal(late.s, 400); assert.notEqual(late.j.confirmed, true);
});

test('an expired code is refused', { skip, timeout: 60_000 }, async () => {
  const s = await startOtp();
  await db.query(`UPDATE verification_sessions SET otp_expires_at = NOW() - interval '1 minute' WHERE session_token = $1`, [s.token]);
  const r = await s.confirm(s.code);
  assert.equal(r.s, 400); assert.equal(r.j.error, 'otp_expired');
});

for (const channel of ['verify', 'hosted'] as const) {
  test(`${channel}: a burst of parallel guesses cannot beat the 3-attempt limit`, { skip, timeout: 60_000 }, async () => {
    const s = await startOtp(channel);
    // 40 simultaneous wrong guesses. Only 3 may ever be EVALUATED as a guess; the rest must be refused.
    const results = await Promise.all(Array.from({ length: 40 }, () => s.confirm(s.wrong)));
    const evaluated = results.filter((r) => r.j.error === 'invalid_otp').length;
    assert.ok(evaluated <= 3, `${evaluated} guesses were evaluated; the limit is 3`);
    // and once the budget is gone, the real code must not get through either
    const late = await s.confirm(s.code);
    assert.notEqual(late.j.confirmed, true, 'the correct code must be refused after the attempts are spent');
  });
}

test('hosted: a person cannot request more than 5 codes for one session', { skip, timeout: 60_000 }, async () => {
  const phone = newPhone();
  const init = await api('/v1/verify/initiate', { phone }, auth);
  const sends = [];
  for (let i = 0; i < 7; i++) sends.push((await api('/v1/hosted/otp/send', { session_token: init.j.session_token })).s);
  assert.deepEqual(sends.slice(0, 5), [200, 200, 200, 200, 200]);
  assert.deepEqual(sends.slice(5), [429, 429]);
});

// ─── identity portal login (a login to a person's verified identity, by phone + code) ────────────

async function startPortal() {
  const phone = newPhone();
  await db.query(`INSERT INTO verified_identities (phone) VALUES ($1)`, [phone]);
  const send = await api('/v1/identity-portal/login/otp/send', { phone });
  assert.equal(send.s, 200);
  const code = lastSms.get(phone)!;
  assert.match(code, /^\d{6}$/);
  return { phone, code, wrong: code === '000000' ? '111111' : '000000', confirm: (otp: string) => api('/v1/identity-portal/login/otp/confirm', { phone, otp }) };
}

test('portal: the right code logs in', { skip, timeout: 60_000 }, async () => {
  const s = await startPortal();
  const r = await s.confirm(s.code);
  assert.equal(r.s, 200, JSON.stringify(r.j)); assert.ok(r.j.token);
});

test('portal: a burst of parallel guesses cannot beat the attempt limit, and the real code is then refused', { skip, timeout: 60_000 }, async () => {
  const s = await startPortal();
  const results = await Promise.all(Array.from({ length: 40 }, () => s.confirm(s.wrong)));
  const evaluated = results.filter((r) => r.j.error === 'invalid_otp').length;
  assert.ok(evaluated <= 5, `${evaluated} guesses were evaluated; the limit is 5`);
  const late = await s.confirm(s.code);
  assert.notEqual(late.s, 200, 'the correct code must be refused once the attempts are spent');
});

test('portal: asking for new codes is capped per phone, so fresh attempts cannot be farmed', { skip, timeout: 60_000 }, async () => {
  const phone = newPhone();
  await db.query(`INSERT INTO verified_identities (phone) VALUES ($1)`, [phone]);
  let sent = 0;
  for (let i = 0; i < 9; i++) { lastSms.delete(phone); await api('/v1/identity-portal/login/otp/send', { phone }); if (lastSms.has(phone)) sent++; }
  assert.equal(sent, 5, 'only 5 codes may be sent to one phone per hour');
});

test('portal: the response is identical for an unregistered phone, even over the limit (no enumeration)', { skip, timeout: 60_000 }, async () => {
  const ghost = newPhone();
  const bodies = [] as string[];
  for (let i = 0; i < 8; i++) { const r = await api('/v1/identity-portal/login/otp/send', { phone: ghost }); bodies.push(`${r.s}:${JSON.stringify(r.j)}`); }
  assert.equal(new Set(bodies).size, 1); assert.equal(lastSms.has(ghost), false);
});

// ─── usage limits ────────────────────────────────────────────────────────────────

test('a free key is stopped at its monthly limit and the counter is exact', { skip, timeout: 60_000 }, async () => {
  await db.query(`UPDATE api_keys SET monthly_limit = 3, verifications_this_month = 0, tier = 'free' WHERE id = $1`, [keyId]);
  const codes = [] as number[];
  for (let i = 0; i < 5; i++) codes.push((await api('/v1/verify/initiate', { phone: newPhone() }, auth)).s);
  assert.deepEqual(codes, [201, 201, 201, 402, 402]);
  const row = await db.query(`SELECT verifications_this_month FROM api_keys WHERE id = $1`, [keyId]);
  assert.equal(row.rows[0].verifications_this_month, 3, 'refused requests are not counted or billed');
  await db.query(`UPDATE api_keys SET monthly_limit = 100000 WHERE id = $1`, [keyId]);
});

// ─── payments ────────────────────────────────────────────────────────────────────

const hook = (ref: string, over: Record<string, unknown> = {}, headers: Record<string, string> = { 'verif-hash': 'whsec_test_hash' }) =>
  api('/v1/developer/billing/webhook', {
    event: 'charge.completed',
    data: { tx_ref: ref, status: 'successful', amount: 49, currency: 'USD', meta: { type: 'afriverify_subscription', api_key_id: keyId, plan: 'starter' }, ...over },
  }, headers);
const resetBilling = async () => {
  payingAmount = 4900; payingCurrency = 'USD'; payingStatus = 'successful';
  await db.query(`DELETE FROM invoices WHERE api_key_id = $1`, [keyId]);
  await db.query(`DELETE FROM subscriptions WHERE api_key_id = $1`, [keyId]);
  await db.query(`UPDATE api_keys SET tier = 'free', monthly_limit = 100 WHERE id = $1`, [keyId]);
};
const invoices = async () => (await db.query(`SELECT count(*)::int AS n FROM invoices WHERE api_key_id = $1`, [keyId])).rows[0].n as number;
const tier = async () => (await db.query(`SELECT tier, monthly_limit FROM api_keys WHERE id = $1`, [keyId])).rows[0];

test('a payment webhook without the shared secret is rejected and changes nothing', { skip, timeout: 60_000 }, async () => {
  await resetBilling();
  assert.equal((await hook('tx-nosig', {}, {})).s, 401);
  assert.equal((await hook('tx-badsig', {}, { 'verif-hash': 'wrong' })).s, 401);
  assert.equal(await invoices(), 0); assert.equal((await tier()).tier, 'free');
});

test('a genuine payment activates the plan, sets the limit and records exactly one invoice', { skip, timeout: 60_000 }, async () => {
  await resetBilling();
  assert.equal((await hook('tx-good-1')).s, 200);
  assert.deepEqual(await tier(), { tier: 'starter', monthly_limit: 2000 });
  assert.equal(await invoices(), 1);
});

test('the same payment delivered again changes nothing', { skip, timeout: 60_000 }, async () => {
  await resetBilling();
  await hook('tx-dup-1'); await hook('tx-dup-1'); await hook('tx-dup-1');
  assert.equal(await invoices(), 1);
});

test('the same payment delivered many times AT ONCE is recorded once', { skip, timeout: 60_000 }, async () => {
  await resetBilling();
  const rs = await Promise.all(Array.from({ length: 8 }, () => hook('tx-race-1')));
  assert.ok(rs.every((r) => r.s === 200), JSON.stringify(rs.map((r) => r.s)));
  assert.equal(await invoices(), 1, 'duplicate deliveries must not create duplicate invoices');
  assert.deepEqual(await tier(), { tier: 'starter', monthly_limit: 2000 });
});

test('a payment smaller than the plan price does NOT activate the plan', { skip, timeout: 60_000 }, async () => {
  await resetBilling();
  payingAmount = 100;                                   // what the payment provider says was really paid: $1
  await hook('tx-cheap-1', { amount: 1, meta: { type: 'afriverify_subscription', api_key_id: keyId, plan: 'growth' } });
  assert.equal((await tier()).tier, 'free', 'paying $1 must not buy the $149 plan');
  assert.equal(await invoices(), 0);
});

test('a payment in the wrong currency does NOT activate the plan', { skip, timeout: 60_000 }, async () => {
  await resetBilling();
  payingCurrency = 'NGN';
  await hook('tx-cur-1', { currency: 'NGN' });
  assert.equal((await tier()).tier, 'free');
});

test('a payment the provider does not confirm as successful does NOT activate the plan', { skip, timeout: 60_000 }, async () => {
  await resetBilling();
  payingStatus = 'failed';                              // the webhook CLAIMS success, the provider says otherwise
  await hook('tx-unconfirmed-1');
  assert.equal((await tier()).tier, 'free');
  assert.equal(await invoices(), 0);
});

test('non-subscription and non-successful events are acknowledged and ignored', { skip, timeout: 60_000 }, async () => {
  await resetBilling();
  assert.equal((await hook('tx-other-1', { meta: { type: 'something_else' } })).s, 200);
  assert.equal((await hook('tx-pending-1', { status: 'pending' })).s, 200);
  assert.equal((await hook('tx-unknown-plan', { meta: { type: 'afriverify_subscription', api_key_id: keyId, plan: 'platinum' } })).s, 200);
  assert.equal(await invoices(), 0); assert.equal((await tier()).tier, 'free');
});
