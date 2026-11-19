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
  process.env.SESSION_JWT_SECRET = 'session-test-secret';
  { const { generateKeyPairSync } = await import('crypto'); const kp = generateKeyPairSync('rsa', { modulusLength: 2048 }); process.env.VIT_PRIVATE_KEY = kp.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(); process.env.VIT_PUBLIC_KEY = kp.publicKey.export({ type: 'spki', format: 'pem' }).toString(); }
  process.env.DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY || 'ab'.repeat(32);

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
  const developerRouter = (await import('../src/routes/developer')).default;
  const ussdRouter = (await import('../src/routes/ussd')).default;
  const authRouter = (await import('../src/routes/auth')).default;
  const vitRouter = (await import('../src/routes/vit')).default;
  const mfaRouter = (await import('../src/routes/mfa')).default;
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use('/v1/verify', verifyRouter);
  app.use('/v1/hosted', hostedRouter);
  app.use('/v1/developer/billing', billingRouter);
  app.use('/v1/identity-portal', portalRouter);
  app.use('/v1/developer', developerRouter);
  app.use('/v1/ussd', ussdRouter);
  app.use('/v1/auth', authRouter);
  app.use('/v1/vit', vitRouter);
  app.use('/v1/auth/mfa', mfaRouter);
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

test('hosted: a person cannot request more than 3 codes for one session', { skip, timeout: 60_000 }, async () => {
  const phone = newPhone();
  const init = await api('/v1/verify/initiate', { phone }, auth);
  const sends = [];
  for (let i = 0; i < 5; i++) sends.push((await api('/v1/hosted/otp/send', { session_token: init.j.session_token })).s);
  assert.deepEqual(sends.slice(0, 3), [200, 200, 200]);
  assert.deepEqual(sends.slice(3), [429, 429]);
});

test('the API route caps codes per session too (it used to have no cap)', { skip, timeout: 60_000 }, async () => {
  const init = await api('/v1/verify/initiate', { phone: newPhone() }, auth);
  const sends = [];
  for (let i = 0; i < 5; i++) sends.push((await api('/v1/verify/otp/send', { session_token: init.j.session_token }, auth)).s);
  assert.deepEqual(sends, [200, 200, 200, 429, 429]);
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

// ─── voucher gate (the website's wallet-credit routes depend on it) ───────────────────────────────

test('voucher gate: no login is refused; a login returns the account id the login proves', { skip, timeout: 60_000 }, async () => {
  const jwt = (await import('jsonwebtoken')).default;
  const token = jwt.sign({ sub: 'dev-' + randomBytes(3).toString('hex'), email: 'v@x.test', company: 'V' }, 'session-test-secret', { expiresIn: '1h' });
  assert.equal((await api('/v1/developer/voucher-gate', { action: 'check' })).s, 401);
  assert.equal((await api('/v1/developer/voucher-gate', { action: 'check' }, { authorization: 'Bearer junk' })).s, 401);
  assert.equal((await api('/v1/developer/voucher-gate', { action: 'check' }, { authorization: `Bearer av_live_x` })).s, 401, 'an API key is not a login');
  assert.equal((await api('/v1/developer/voucher-gate', { action: 'steal' }, { authorization: `Bearer ${token}` })).s, 400);
  const ok = await api('/v1/developer/voucher-gate', { action: 'check' }, { authorization: `Bearer ${token}` });
  assert.equal(ok.s, 200); assert.equal(ok.j.developer_id, (jwt.decode(token) as any).sub);
});

test('voucher gate: redeeming is limited to 5 a minute per account, checking to 15, and accounts do not share limits', { skip, timeout: 60_000 }, async () => {
  const jwt = (await import('jsonwebtoken')).default;
  const mk = () => jwt.sign({ sub: 'dev-' + randomBytes(4).toString('hex'), email: 'v@x.test', company: 'V' }, 'session-test-secret', { expiresIn: '1h' });
  const a = mk(), b = mk();
  const redeem = [] as number[];
  for (let i = 0; i < 8; i++) redeem.push((await api('/v1/developer/voucher-gate', { action: 'redeem' }, { authorization: `Bearer ${a}` })).s);
  assert.deepEqual(redeem, [200, 200, 200, 200, 200, 429, 429, 429]);
  const check = [] as number[];
  for (let i = 0; i < 17; i++) check.push((await api('/v1/developer/voucher-gate', { action: 'check' }, { authorization: `Bearer ${b}` })).s);
  assert.equal(check.filter((x) => x === 200).length, 15); assert.equal(check.filter((x) => x === 429).length, 2);
  assert.equal((await api('/v1/developer/voucher-gate', { action: 'check' }, { authorization: `Bearer ${mk()}` })).s, 200, 'another account is unaffected');
  const burst = await Promise.all(Array.from({ length: 30 }, () => api('/v1/developer/voucher-gate', { action: 'redeem' }, { authorization: `Bearer ${mk()}` })));
  assert.ok(burst.every((r) => r.s === 200), 'separate accounts in parallel are all fine');
});

test('voucher gate: parallel attempts from one account cannot exceed the limit', { skip, timeout: 60_000 }, async () => {
  const jwt = (await import('jsonwebtoken')).default;
  const t = jwt.sign({ sub: 'dev-par-' + randomBytes(3).toString('hex'), email: 'v@x.test', company: 'V' }, 'session-test-secret', { expiresIn: '1h' });
  const rs = await Promise.all(Array.from({ length: 30 }, () => api('/v1/developer/voucher-gate', { action: 'redeem' }, { authorization: `Bearer ${t}` })));
  assert.equal(rs.filter((r) => r.s === 200).length, 5, 'exactly 5 get through, however they arrive');
});

// ─── USSD: a session proves SIM possession ONLY if the request really comes from the carrier aggregator ──────
// Each API key has its OWN callback secret (shown once, stored as a hash), so one customer's secret cannot be used
// against another customer's short code.

const CODE_A = '*384*555#', CODE_B = '*384*556#';
const ussd = (code: string, phone: string, text: string, qs = '', headers: Record<string, string> = {}) =>
  fetch(`${base}/v1/ussd/callback${qs}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams({ sessionId: 's1', serviceCode: code, phoneNumber: phone, text }) }).then(async (r) => ({ s: r.status, t: await r.text() }));
const identityFor = async (phone: string) => (await db.query(`SELECT verification_level FROM verified_identities WHERE phone = $1`, [phone])).rows[0];
const ownerToken = async () => (await import('jsonwebtoken')).default.sign({ sub: 'owner', email: 'core@flow.test', company: 'CoreFlow' }, 'session-test-secret', { expiresIn: '1h' });
const patchCode = async (id: string, code: string | null) =>
  fetch(`${base}/v1/developer/keys/${id}/ussd-code`, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${await ownerToken()}` }, body: JSON.stringify({ ussd_service_code: code }) }).then(async (r) => ({ s: r.status, j: await r.json() as any }));
const rotate = async (id: string) =>
  fetch(`${base}/v1/developer/keys/${id}/ussd-secret`, { method: 'POST', headers: { authorization: `Bearer ${await ownerToken()}` } }).then(async (r) => ({ s: r.status, j: await r.json() as any }));
const secretOf = (url: string) => new URL(url).searchParams.get('key')!;
let keyB = '';
async function ensureKeyB() {
  if (keyB) return keyB;
  const r = await db.query(`INSERT INTO api_keys (platform_name, platform_email, api_key_hash, api_key_prefix, permissions, tier, monthly_limit)
    VALUES ('CoreFlowB', 'core@flow.test', $1, 'av_live_coreb', '["verify"]', 'free', 100000) RETURNING id`, [sha('b-' + KEY)]);
  keyB = r.rows[0].id; return keyB;
}

test('ussd: a key with a short code but NO secret (every existing setup) refuses callbacks: forged requests verify nothing', { skip, timeout: 60_000 }, async () => {
  await db.query(`UPDATE api_keys SET ussd_service_code = $1, ussd_callback_secret_hash = NULL WHERE id = $2`, [CODE_A, keyId]);
  const victim = newPhone();
  const before = (await db.query(`SELECT verifications_this_month AS n FROM api_keys WHERE id = $1`, [keyId])).rows[0].n;
  for (const qs of ['', '?key=guess', '?key=']) assert.equal((await ussd(CODE_A, victim, '1', qs)).s, 401);
  assert.equal(await identityFor(victim), undefined, 'no identity may be created for a number nobody proved they hold');
  assert.equal((await db.query(`SELECT verifications_this_month AS n FROM api_keys WHERE id = $1`, [keyId])).rows[0].n, before, 'and no customer quota may be burned');
});

test('ussd: the owner gets the secret ONCE; with it callbacks work (query or header); wrong or missing is refused', { skip, timeout: 60_000 }, async () => {
  await db.query(`UPDATE api_keys SET ussd_service_code = NULL, ussd_callback_secret_hash = NULL WHERE id = $1`, [keyId]);
  const set = await patchCode(keyId, CODE_A);
  assert.equal(set.s, 200); assert.match(set.j.callback_url, /\/v1\/ussd\/callback\?key=[0-9a-f]{48}$/);
  const secret = secretOf(set.j.callback_url);
  const again = await patchCode(keyId, CODE_A);
  assert.equal(again.j.callback_secret, undefined, 'the secret is never shown a second time');
  const stored = (await db.query(`SELECT ussd_callback_secret_hash AS h FROM api_keys WHERE id = $1`, [keyId])).rows[0].h;
  assert.equal(stored, sha(secret)); assert.notEqual(stored, secret, 'only a hash is stored');

  const p1 = newPhone(), p2 = newPhone();
  assert.equal((await ussd(CODE_A, p1, '1', '?key=wrong')).s, 401);
  assert.equal((await ussd(CODE_A, p1, '1', '', { 'x-ussd-secret': 'wrong' })).s, 401);
  assert.equal(await identityFor(p1), undefined);
  const ok = await ussd(CODE_A, p1, '1', `?key=${secret}`);
  assert.equal(ok.s, 200); assert.match(ok.t, /^END /); assert.equal((await identityFor(p1)).verification_level, 1);
  assert.equal((await ussd(CODE_A, p2, '1', '', { 'x-ussd-secret': secret })).s, 200);
});

test('ussd: the status check is not an oracle for strangers', { skip, timeout: 60_000 }, async () => {
  const known = newPhone();
  await db.query(`INSERT INTO verified_identities (phone, verification_level, trust_level) VALUES ($1, 2, 'rising')`, [known]);
  const r = await ussd(CODE_A, known, '2');
  assert.equal(r.s, 401); assert.ok(!/Level|Trust level/i.test(r.t), r.t);
});

test('ussd: one customer\'s secret cannot be used against another customer\'s short code', { skip, timeout: 60_000 }, async () => {
  await db.query(`UPDATE api_keys SET ussd_service_code = NULL, ussd_callback_secret_hash = NULL WHERE id = $1`, [keyId]);
  const a = await patchCode(keyId, CODE_A); const b = await patchCode(await ensureKeyB(), CODE_B);
  const secretA = secretOf(a.j.callback_url), secretB = secretOf(b.j.callback_url);
  assert.notEqual(secretA, secretB);
  const victim = newPhone();
  assert.equal((await ussd(CODE_A, victim, '1', `?key=${secretB}`)).s, 401, "B's secret must not work on A's code");
  assert.equal((await ussd(CODE_B, victim, '1', `?key=${secretA}`)).s, 401, "A's secret must not work on B's code");
  assert.equal(await identityFor(victim), undefined);
  assert.equal((await ussd(CODE_B, victim, '1', `?key=${secretB}`)).s, 200);
});

test('ussd: an unknown short code is refused exactly like a wrong secret (nothing to enumerate)', { skip, timeout: 60_000 }, async () => {
  const p = newPhone();
  const unknown = await ussd('*384*999#', p, '1', '?key=whatever');
  const wrong = await ussd(CODE_A, p, '1', '?key=whatever');
  assert.deepEqual([unknown.s, unknown.t], [wrong.s, wrong.t]);
});

test('ussd: rotating the secret kills the old URL at once; clearing the code clears the secret', { skip, timeout: 60_000 }, async () => {
  await db.query(`UPDATE api_keys SET ussd_service_code = NULL, ussd_callback_secret_hash = NULL WHERE id = $1`, [keyId]);
  const first = secretOf((await patchCode(keyId, CODE_A)).j.callback_url);
  const rot = await rotate(keyId); assert.equal(rot.s, 200);
  const second = secretOf(rot.j.callback_url); assert.notEqual(first, second);
  const p = newPhone();
  assert.equal((await ussd(CODE_A, p, '1', `?key=${first}`)).s, 401, 'the old secret is dead');
  assert.equal((await ussd(CODE_A, p, '1', `?key=${second}`)).s, 200);
  await patchCode(keyId, null);
  const row = (await db.query(`SELECT ussd_service_code AS c, ussd_callback_secret_hash AS h FROM api_keys WHERE id = $1`, [keyId])).rows[0];
  assert.deepEqual([row.c, row.h], [null, null]);
  assert.equal((await rotate(keyId)).s, 404, 'cannot create a secret for a key with no short code');
});

test('ussd: strangers cannot use up a victim\'s allowance (limits apply only after authentication)', { skip, timeout: 60_000 }, async () => {
  await db.query(`UPDATE api_keys SET ussd_service_code = NULL, ussd_callback_secret_hash = NULL WHERE id = $1`, [keyId]);
  const secret = secretOf((await patchCode(keyId, CODE_A)).j.callback_url);
  const victim = newPhone();
  await Promise.all(Array.from({ length: 40 }, () => ussd(CODE_A, victim, '1', '?key=forged')));
  assert.equal((await ussd(CODE_A, victim, '1', `?key=${secret}`)).s, 200, 'the real user is not locked out by forged traffic');
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

const quoteFor = (ref: string, currency: string, minor: number) =>
  db.query(`INSERT INTO checkout_quotes (reference, api_key_id, plan, currency, amount_minor) VALUES ($1, $2, 'starter', $3, $4)`, [ref, keyId, currency, minor]);

test('a local-currency payment is accepted only when it meets the saved quote', { skip, timeout: 60_000 }, async () => {
  await resetBilling();
  await quoteFor('tx-ngn-ok', 'NGN', 7_850_000);
  payingAmount = 7_850_000; payingCurrency = 'NGN';
  assert.equal((await hook('tx-ngn-ok', { amount: 78500, currency: 'NGN' })).s, 200);
  assert.deepEqual(await tier(), { tier: 'starter', monthly_limit: 2000 });
  const inv = (await db.query(`SELECT currency, amount_cents FROM invoices WHERE api_key_id = $1`, [keyId])).rows[0];
  assert.deepEqual([inv.currency, Number(inv.amount_cents)], ['NGN', 7_850_000]);
});

test('a local-currency payment that is short of the quote, or in another currency, does NOT activate', { skip, timeout: 60_000 }, async () => {
  await resetBilling();
  await quoteFor('tx-ngn-short', 'NGN', 7_850_000);
  payingAmount = 7_849_900; payingCurrency = 'NGN';
  await hook('tx-ngn-short', { amount: 78499, currency: 'NGN' });
  assert.equal((await tier()).tier, 'free');
  await quoteFor('tx-ngn-usd', 'NGN', 7_850_000);
  payingAmount = 4900; payingCurrency = 'USD';
  await hook('tx-ngn-usd');
  assert.equal((await tier()).tier, 'free', 'paying 49 dollars does not satisfy a naira quote');
  assert.equal(await invoices(), 0);
});

test('a quote for one plan cannot be used to buy another', { skip, timeout: 60_000 }, async () => {
  await resetBilling();
  await quoteFor('tx-ngn-plan', 'NGN', 7_850_000);
  payingAmount = 7_850_000; payingCurrency = 'NGN';
  await hook('tx-ngn-plan', { amount: 78500, currency: 'NGN', meta: { type: 'afriverify_subscription', api_key_id: keyId, plan: 'growth' } });
  assert.equal((await tier()).tier, 'free');
});

test('non-subscription and non-successful events are acknowledged and ignored', { skip, timeout: 60_000 }, async () => {
  await resetBilling();
  assert.equal((await hook('tx-other-1', { meta: { type: 'something_else' } })).s, 200);
  assert.equal((await hook('tx-pending-1', { status: 'pending' })).s, 200);
  assert.equal((await hook('tx-unknown-plan', { meta: { type: 'afriverify_subscription', api_key_id: keyId, plan: 'platinum' } })).s, 200);
  assert.equal(await invoices(), 0); assert.equal((await tier()).tier, 'free');
});

// ─── metering v2: billed by how far a session goes, switched on by date, grandfathered, free tier gated ────────

async function meterSetup(over: { tier?: string; env?: string; phone?: string } = {}) {
  await db.query(`UPDATE api_keys SET tier = $1, environment = $2, monthly_limit = 100000, verifications_this_month = 0 WHERE id = $3`, [over.tier ?? 'starter', over.env ?? 'production', keyId]);
  await db.query(`DELETE FROM usage_records WHERE api_key_id = $1`, [keyId]);
  await db.query(`DELETE FROM subscriptions WHERE api_key_id = $1`, [keyId]);
  const phone = over.phone ?? newPhone();
  const r = await db.query(
    `INSERT INTO verification_sessions (session_token, phone, otp_channel, step, api_key_id, expires_at)
     VALUES ($1, $2, 'sms', 'id_upload', $3, NOW() + INTERVAL '15 minutes') RETURNING id`,
    [randomBytes(32).toString('hex'), phone, keyId]
  );
  return { sessionId: r.rows[0].id as string, phone };
}
const counted = async () => Number((await db.query(`SELECT verifications_this_month AS n FROM api_keys WHERE id = $1`, [keyId])).rows[0].n);
const records = async () => (await db.query(`SELECT verification_type AS t, SUM(count)::int AS n FROM usage_records WHERE api_key_id = $1 GROUP BY 1 ORDER BY 1`, [keyId])).rows;
const stepOf = async (step: 'phone' | 'id' | 'face', s: { sessionId: string; phone: string }) => {
  const { chargeStep } = await import('../src/services/metering.service');
  return chargeStep({ sessionId: s.sessionId, apiKeyId: keyId, phone: s.phone, step });
};

test('metering: nothing changes until the effective date is set', { skip, timeout: 60_000 }, async () => {
  delete process.env.METERING_V2_AT;
  const s = await meterSetup();
  assert.deepEqual(await stepOf('id', s), { ok: true });
  assert.deepEqual(await stepOf('face', s), { ok: true });
  assert.equal(await counted(), 0);
  assert.deepEqual(await records(), []);
});

test('metering: an ID step adds 2 units and a face step 2 more, each exactly once', { skip, timeout: 60_000 }, async () => {
  process.env.METERING_V2_AT = '2020-01-01T00:00:00Z';
  const s = await meterSetup();
  await stepOf('id', s); await stepOf('id', s);               // a retry must not double-charge
  assert.equal(await counted(), 2);
  await stepOf('face', s); await stepOf('face', s);
  assert.equal(await counted(), 4);                           // 1 (counted at creation) + 4 = 5 units for a full verification
  assert.deepEqual(await records(), [{ t: 'level2', n: 2 }, { t: 'level3', n: 2 }]);
});

test('metering: parallel requests for the same step charge once', { skip, timeout: 60_000 }, async () => {
  process.env.METERING_V2_AT = '2020-01-01T00:00:00Z';
  const s = await meterSetup();
  await Promise.all(Array.from({ length: 8 }, () => stepOf('id', s)));
  assert.equal(await counted(), 2);
});

test('metering: a premium-SMS country adds one unit to the phone check and to the total', { skip, timeout: 60_000 }, async () => {
  process.env.METERING_V2_AT = '2020-01-01T00:00:00Z';
  process.env.SMS_PREMIUM_PREFIXES = JSON.stringify(['2349']);
  try {
    const s = await meterSetup({ phone: '+2349012345678' });
    await stepOf('phone', s);
    assert.equal(await counted(), 1);
    await stepOf('id', s);
    assert.equal(await counted(), 3);                         // 3 + 1 premium = 4 total, 1 already counted at creation
  } finally { delete process.env.SMS_PREMIUM_PREFIXES; }
});

test('metering: a free live key cannot run ID or face steps, but a free sandbox key can and is not charged', { skip, timeout: 60_000 }, async () => {
  process.env.METERING_V2_AT = '2020-01-01T00:00:00Z';
  const blocked = await stepOf('id', await meterSetup({ tier: 'free', env: 'production' }));
  assert.equal(blocked.ok, false); assert.equal(blocked.status, 402); assert.equal(blocked.body!.error, 'plan_required');
  assert.equal(await counted(), 0);
  const sandbox = await stepOf('id', await meterSetup({ tier: 'free', env: 'sandbox' }));
  assert.equal(sandbox.ok, true);
});

test('metering: a customer whose paid period began before the effective date keeps old metering until it ends', { skip, timeout: 60_000 }, async () => {
  process.env.METERING_V2_AT = new Date(Date.now() - 5 * 86400_000).toISOString();     // took effect 5 days ago
  const s = await meterSetup();
  await db.query(
    `INSERT INTO subscriptions (api_key_id, plan, status, payment_provider, provider_reference, current_period_start, current_period_end, amount_cents, currency)
     VALUES ($1, 'starter', 'active', 'flutterwave', $2, NOW() - INTERVAL '10 days', NOW() + INTERVAL '20 days', 4900, 'USD')`, [keyId, `gf-${randomBytes(4).toString('hex')}`]
  );
  await stepOf('id', s);
  assert.equal(await counted(), 0, 'still on the old metering: this cycle is grandfathered');
  await db.query(`UPDATE subscriptions SET current_period_end = NOW() - INTERVAL '1 hour' WHERE api_key_id = $1`, [keyId]);
  await stepOf('id', s);
  assert.equal(await counted(), 2, 'once the paid period has ended, the new metering applies');
});

test('free keys: one email may hold at most 2 free live keys; sandbox keys are not limited', { skip, timeout: 60_000 }, async () => {
  const email = `farm-${randomBytes(3).toString('hex')}@keys.test`;
  const make = (environment: string) => api('/v1/developer/keys', { platform_name: 'Farm Co', platform_email: email, environment });
  const a = await make('production'); const b = await make('production'); const c = await make('production');
  assert.equal(a.s, 201); assert.equal(b.s, 201);
  assert.equal(a.j.monthly_limit, 50, 'new live free keys start at 50 sessions a month');
  assert.equal(c.s, 429); assert.equal(c.j.error, 'free_key_limit');
  const sb = await make('sandbox');
  assert.equal(sb.s, 201); assert.equal(sb.j.monthly_limit, 100);
});

// ─── retention: ID photos and selfies of completed verifications are deleted after the stated period ───────────

test('retention: completed-verification photos older than the period are deleted; recent and incomplete ones are not', { skip, timeout: 60_000 }, async () => {
  const s3 = await import('../src/utils/s3');
  const deleted: string[] = [];
  (s3 as any).deleteFromS3 = async (k: string) => { deleted.push(k); };
  const { purgeCompletedSessionMedia } = await import('../src/services/retention.service');
  const mk = async (step: string, ageDays: number, tag: string) => {
    const r = await db.query(
      `INSERT INTO verification_sessions (session_token, phone, otp_channel, step, api_key_id, expires_at, id_photo_s3_key, face_photo_s3_key, completed_at)
       VALUES ($1, $2, 'sms', $3, $4, NOW() + INTERVAL '1 day', $5, $6, NOW() - ($7 || ' days')::interval) RETURNING id`,
      [randomBytes(32).toString('hex'), newPhone(), step, keyId, `id/${tag}.jpg`, `face/${tag}.jpg`, String(ageDays)]
    );
    return r.rows[0].id as string;
  };
  const old = await mk('complete', 400, 'old');
  const recent = await mk('complete', 30, 'recent');
  const incomplete = await mk('face_scan', 400, 'inc');
  const n = await purgeCompletedSessionMedia(365);
  assert.ok(n >= 1);
  assert.deepEqual(deleted.sort(), ['face/old.jpg', 'id/old.jpg']);
  const row = async (id: string) => (await db.query(`SELECT id_photo_s3_key AS a, face_photo_s3_key AS b FROM verification_sessions WHERE id = $1`, [id])).rows[0];
  assert.deepEqual(await row(old), { a: null, b: null });
  assert.deepEqual(await row(recent), { a: 'id/recent.jpg', b: 'face/recent.jpg' });
  assert.deepEqual(await row(incomplete), { a: 'id/inc.jpg', b: 'face/inc.jpg' }, 'incomplete sessions follow the 30-day rule, not this one');
});

test('retention: a failed delete keeps the key so tomorrow retries it', { skip, timeout: 60_000 }, async () => {
  const s3 = await import('../src/utils/s3');
  (s3 as any).deleteFromS3 = async () => { throw new Error('storage down'); };
  const { purgeCompletedSessionMedia } = await import('../src/services/retention.service');
  const r = await db.query(
    `INSERT INTO verification_sessions (session_token, phone, otp_channel, step, api_key_id, expires_at, id_photo_s3_key, completed_at)
     VALUES ($1, $2, 'sms', 'complete', $3, NOW() + INTERVAL '1 day', 'id/stuck.jpg', NOW() - INTERVAL '500 days') RETURNING id`,
    [randomBytes(32).toString('hex'), newPhone(), keyId]
  );
  await purgeCompletedSessionMedia(365);
  assert.equal((await db.query(`SELECT id_photo_s3_key AS a FROM verification_sessions WHERE id = $1`, [r.rows[0].id])).rows[0].a, 'id/stuck.jpg');
});

// ─── dashboard two-step verification ───────────────────────────────────────────────────────────────────────

import { totp } from '../src/utils/totp';
const authCall = (p: string, body: unknown, token?: string) =>
  fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
    .then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) as any }));
const authGet = (p: string, token: string) =>
  fetch(base + p, { headers: { authorization: `Bearer ${token}` } }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) as any }));

async function newDeveloper() {
  const email = `mfa-${randomBytes(4).toString('hex')}@dash.test`;
  const password = 'correct horse battery';
  const reg = await authCall('/v1/auth/register', { email, password, company_name: 'MFA Co', full_name: 'Mia Fa' });
  assert.equal(reg.s, 201, JSON.stringify(reg.j));
  return { email, password, token: reg.j.token as string, id: reg.j.developer.id as string };
}
async function turnOnMfa() {
  const d = await newDeveloper();
  const setup = await authCall('/v1/auth/mfa/setup', {}, d.token);
  assert.equal(setup.s, 200, JSON.stringify(setup.j));
  const enable = await authCall('/v1/auth/mfa/enable', { code: totp(setup.j.secret) }, d.token);
  assert.equal(enable.s, 200, JSON.stringify(enable.j));
  return { ...d, secret: setup.j.secret as string, recovery: enable.j.recovery_codes as string[] };
}
const nextCode = (secret: string, stepsAhead = 1) => totp(secret, Date.now() + stepsAhead * 30_000);   // inside the +1 drift window, newer than the last accepted step
const clearLock = async (id: string) => { const redis = (await import('../src/redis')).default; await redis.del(`mfa-fail:${id}`); };

test('mfa: accounts without it log in exactly as before', { skip, timeout: 60_000 }, async () => {
  const d = await newDeveloper();
  const login = await authCall('/v1/auth/login', { email: d.email, password: d.password });
  assert.equal(login.s, 200);
  assert.ok(login.j.token); assert.equal(login.j.mfa_required, undefined);
  assert.equal((await authGet('/v1/auth/mfa/status', login.j.token)).j.enabled, false);
});

test('mfa: setup needs a real code to switch on, stores the secret encrypted, and gives 10 recovery codes once', { skip, timeout: 60_000 }, async () => {
  const d = await newDeveloper();
  const setup = await authCall('/v1/auth/mfa/setup', {}, d.token);
  assert.match(setup.j.secret, /^[A-Z2-7]{32}$/);
  assert.match(setup.j.otpauth_uri, /^otpauth:\/\/totp\//);
  assert.equal((await authGet('/v1/auth/mfa/status', d.token)).j.enabled, false, 'not on until proven');
  const bad = await authCall('/v1/auth/mfa/enable', { code: '000000' }, d.token);
  assert.equal(bad.s, 401);
  const good = await authCall('/v1/auth/mfa/enable', { code: totp(setup.j.secret) }, d.token);
  assert.equal(good.s, 200); assert.equal(good.j.recovery_codes.length, 10);
  const st = (await authGet('/v1/auth/mfa/status', d.token)).j;
  assert.deepEqual([st.enabled, st.recovery_codes_remaining], [true, 10]);
  const row = (await db.query(`SELECT mfa_secret_enc, mfa_pending_secret_enc, mfa_recovery_hashes FROM developers WHERE id = $1`, [d.id])).rows[0];
  assert.ok(row.mfa_secret_enc && !row.mfa_secret_enc.includes(setup.j.secret), 'the secret is not stored in clear');
  assert.equal(row.mfa_pending_secret_enc, null);
  assert.ok(!JSON.stringify(row.mfa_recovery_hashes).includes(good.j.recovery_codes[0].replace('-', '')), 'recovery codes are stored as hashes');
  assert.equal((await authCall('/v1/auth/mfa/setup', {}, d.token)).s, 409, 'cannot start setup again while on');
});

test('mfa: a password alone no longer gives a session; the challenge pass cannot be used as one', { skip, timeout: 60_000 }, async () => {
  const d = await turnOnMfa();
  const login = await authCall('/v1/auth/login', { email: d.email, password: d.password });
  assert.equal(login.s, 200);
  assert.equal(login.j.mfa_required, true); assert.equal(login.j.token, undefined); assert.ok(login.j.mfa_token);
  assert.equal((await authGet('/v1/auth/mfa/status', login.j.mfa_token)).s, 401, 'the challenge pass is not a session');
  assert.equal((await authCall('/v1/auth/login', { email: d.email, password: 'wrong password!' })).s, 401);
});

test('mfa: the right code finishes login once; the same code again is refused (replay)', { skip, timeout: 60_000 }, async () => {
  const d = await turnOnMfa();
  const ch = (await authCall('/v1/auth/login', { email: d.email, password: d.password })).j.mfa_token;
  const code = nextCode(d.secret);
  const ok = await authCall('/v1/auth/login/mfa', { mfa_token: ch, code });
  assert.equal(ok.s, 200, JSON.stringify(ok.j)); assert.ok(ok.j.token);
  assert.equal((await authGet('/v1/auth/mfa/status', ok.j.token)).s, 200, 'the new session works');
  const again = await authCall('/v1/auth/login/mfa', { mfa_token: ch, code });
  assert.equal(again.s, 401, 'a code cannot be used twice');
});

test('mfa: five wrong codes lock the second step, even for the right code, and a garbage challenge pass is refused', { skip, timeout: 60_000 }, async () => {
  const d = await turnOnMfa();
  const ch = (await authCall('/v1/auth/login', { email: d.email, password: d.password })).j.mfa_token;
  const results = [];
  for (let i = 0; i < 5; i++) results.push((await authCall('/v1/auth/login/mfa', { mfa_token: ch, code: '000000' })).s);
  assert.deepEqual(results, [401, 401, 401, 401, 429], 'the fifth wrong code locks');
  const locked = await authCall('/v1/auth/login/mfa', { mfa_token: ch, code: nextCode(d.secret) });
  assert.equal(locked.s, 429, 'the right code is refused while locked');
  await clearLock(d.id);
  assert.equal((await authCall('/v1/auth/login/mfa', { mfa_token: ch, code: nextCode(d.secret) })).s, 200);
  assert.equal((await authCall('/v1/auth/login/mfa', { mfa_token: 'x'.repeat(40), code: '123456' })).s, 401);
});

test('mfa: a recovery code works once and the count goes down', { skip, timeout: 60_000 }, async () => {
  const d = await turnOnMfa();
  const ch = (await authCall('/v1/auth/login', { email: d.email, password: d.password })).j.mfa_token;
  const first = await authCall('/v1/auth/login/mfa', { mfa_token: ch, code: d.recovery[0].toUpperCase() });
  assert.equal(first.s, 200, JSON.stringify(first.j)); assert.equal(first.j.recovery_codes_remaining, 9);
  assert.equal((await authCall('/v1/auth/login/mfa', { mfa_token: ch, code: d.recovery[0] })).s, 401, 'a recovery code is single use');
  assert.equal((await authGet('/v1/auth/mfa/status', first.j.token)).j.recovery_codes_remaining, 9);
});

test('mfa: replacing recovery codes needs an authenticator code and kills the old set', { skip, timeout: 60_000 }, async () => {
  const d = await turnOnMfa();
  assert.equal((await authCall('/v1/auth/mfa/recovery-codes', { code: d.recovery[0] }, d.token)).s, 401, 'a recovery code is not enough');
  await clearLock(d.id);
  const out = await authCall('/v1/auth/mfa/recovery-codes', { code: nextCode(d.secret) }, d.token);
  assert.equal(out.s, 200); assert.equal(out.j.recovery_codes.length, 10);
  const ch = (await authCall('/v1/auth/login', { email: d.email, password: d.password })).j.mfa_token;
  assert.equal((await authCall('/v1/auth/login/mfa', { mfa_token: ch, code: d.recovery[1] })).s, 401, 'old codes are dead');
  assert.equal((await authCall('/v1/auth/login/mfa', { mfa_token: ch, code: out.j.recovery_codes[0] })).s, 200);
});

test('mfa: turning it off needs the password AND a code, then login is password-only again', { skip, timeout: 60_000 }, async () => {
  const d = await turnOnMfa();
  assert.equal((await authCall('/v1/auth/mfa/disable', { password: 'wrong password!', code: nextCode(d.secret) }, d.token)).s, 401);
  await clearLock(d.id);
  assert.equal((await authCall('/v1/auth/mfa/disable', { password: d.password, code: '000000' }, d.token)).s, 401);
  await clearLock(d.id);
  const off = await authCall('/v1/auth/mfa/disable', { password: d.password, code: nextCode(d.secret) }, d.token);
  assert.equal(off.s, 200);
  const row = (await db.query(`SELECT mfa_secret_enc, mfa_enabled_at, mfa_recovery_hashes FROM developers WHERE id = $1`, [d.id])).rows[0];
  assert.deepEqual([row.mfa_secret_enc, row.mfa_enabled_at, row.mfa_recovery_hashes], [null, null, []]);
  const login = await authCall('/v1/auth/login', { email: d.email, password: d.password });
  assert.ok(login.j.token); assert.equal(login.j.mfa_required, undefined);
});

// ─── Verified Identity Token: the person decides whether their name is in it ───────────────────────────────

const jwtPayload = (t: string) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8'));
async function portalSession(fullName = 'Ama Boateng') {
  const phone = newPhone();
  const row = await db.query(`INSERT INTO verified_identities (phone, full_name, nationality, verification_level) VALUES ($1, $2, 'GH', 2) RETURNING id`, [phone, fullName]);
  await api('/v1/identity-portal/login/otp/send', { phone });
  const login = await api('/v1/identity-portal/login/otp/confirm', { phone, otp: lastSms.get(phone)! });
  assert.equal(login.s, 200, JSON.stringify(login.j));
  const bearer = { authorization: `Bearer ${login.j.token}` };
  return { id: row.rows[0].id as string, bearer, refresh: (body: unknown) => api('/v1/identity-portal/vit/refresh', body, bearer),
    list: () => fetch(base + '/v1/identity-portal/vit', { headers: bearer }).then((r) => r.json() as Promise<any>) };
}
const verifyAsPlatform = (token: string) => api('/v1/vit/verify', { token }, auth);

test('token: by default the person\'s own token does NOT contain their name', { skip, timeout: 60_000 }, async () => {
  const p = await portalSession();
  const r = await p.refresh({});
  assert.equal(r.s, 200, JSON.stringify(r.j));
  const claims = jwtPayload(r.j.token);
  assert.equal(claims.name, undefined, 'no name in the token a platform can decode');
  assert.equal(claims.name_consent, undefined);
  assert.equal(claims.nationality, 'GH'); assert.equal(claims.level, 2);
  assert.equal((await p.list()).vits[0].name_sharing, 'none');
  const v = await verifyAsPlatform(r.j.token);
  assert.equal(v.j.valid, true); assert.equal(v.j.claims.name, undefined);
});

test('token: if the person ticks the box, the name is in the token and the platform sees it', { skip, timeout: 60_000 }, async () => {
  const p = await portalSession('Kofi Mensah');
  const r = await p.refresh({ include_name: true });
  const claims = jwtPayload(r.j.token);
  assert.equal(claims.name, 'Kofi Mensah'); assert.equal(claims.name_consent, 'holder');
  assert.equal((await p.list()).vits[0].name_sharing, 'holder');
  assert.equal((await verifyAsPlatform(r.j.token)).j.claims.name, 'Kofi Mensah');
});

test('token: refreshing swaps the choice and revokes the old token', { skip, timeout: 60_000 }, async () => {
  const p = await portalSession('Esi Owusu');
  const withName = (await p.refresh({ include_name: true })).j.token;
  const without = (await p.refresh({ include_name: false })).j.token;
  const list = (await p.list()).vits;
  assert.equal(list.length, 1); assert.equal(list[0].name_sharing, 'none');
  assert.equal((await verifyAsPlatform(withName)).j.error, 'token_revoked');
  assert.equal((await verifyAsPlatform(without)).j.valid, true);
});

test('token: a wrong value for the choice is refused, not guessed', { skip, timeout: 60_000 }, async () => {
  const p = await portalSession();
  assert.equal((await p.refresh({ include_name: 'yes' })).s, 400);
});

test('token: tokens issued by a platform-run verification keep working as before (name in the token, still hidden in platform claims)', { skip, timeout: 60_000 }, async () => {
  const { issueVIT } = await import('../src/services/vit.service');
  const p = await portalSession('Yaw Asante');
  const { token } = await issueVIT(p.id, { nameSharing: 'platform' });
  const claims = jwtPayload(token);
  assert.equal(claims.name, 'Yaw Asante'); assert.equal(claims.name_consent, 'platform');
  assert.equal((await p.list()).vits.find((v: any) => v.name_sharing === 'platform') !== undefined, true);
  assert.equal((await verifyAsPlatform(token)).j.claims.name, undefined, 'the platform API still hides it unless the holder chose it');
});
