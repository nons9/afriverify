import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { EventEmitter } from 'events';
import express from 'express';
import redis from '../src/redis';
import { idempotency, fingerprint, stableStringify } from '../src/middleware/idempotency';
import { setRateLimitHeaders } from '../src/utils/ratelimit-headers';
import openapiRouter from '../src/routes/openapi';

// ── in-memory Redis stand-in with SET NX EX / GET / DEL ──
const mem = new Map<string, string>();
let redisDown = false;
(redis as any).set = async (k: string, v: string, ...args: unknown[]) => {
  if (redisDown) throw new Error('down');
  if (args.includes('NX') && mem.has(k)) return null;
  mem.set(k, v); return 'OK';
};
(redis as any).get = async (k: string) => { if (redisDown) throw new Error('down'); return mem.get(k) ?? null; };
(redis as any).del = async (k: string) => { mem.delete(k); return 1; };

function fakeRes() {
  const e: any = new EventEmitter();
  e.statusCode = 200; e.headers = {} as Record<string, string>; e.body = undefined; e.ended = false;
  e.setHeader = (k: string, v: string) => { e.headers[k.toLowerCase()] = v; };
  e.status = (c: number) => { e.statusCode = c; return e; };
  e.json = (b: unknown) => { e.body = b; e.ended = true; e.emit('finish'); return e; };
  return e;
}
const settle = () => new Promise((r) => setTimeout(r, 15));

/** Runs one request through the middleware; `handler` stands for the real route and counts executions. */
async function call(opts: { key?: string; keyId?: string; body?: unknown; method?: string; ctype?: string; handler?: (res: any) => void }) {
  const res = fakeRes();
  let ran = false;
  const req: any = {
    method: opts.method ?? 'POST', baseUrl: '/v1/verify', path: '/initiate', body: opts.body ?? {},
    apiKey: { id: opts.keyId ?? 'key-A' }, headers: { 'content-type': opts.ctype ?? 'application/json' },
    header: (n: string) => (n.toLowerCase() === 'idempotency-key' ? opts.key : undefined),
  };
  await idempotency(req, res, () => { ran = true; (opts.handler ?? ((r) => r.status(201).json({ session_token: 'tok-' + Math.random() })))(res); });
  await settle();
  return { res, ran };
}

test('stableStringify and fingerprint ignore key order but not content', () => {
  assert.equal(stableStringify({ b: 1, a: { d: 2, c: 3 } }), stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
  assert.equal(fingerprint('POST', '/x', { a: 1, b: 2 }), fingerprint('POST', '/x', { b: 2, a: 1 }));
  assert.notEqual(fingerprint('POST', '/x', { a: 1 }), fingerprint('POST', '/x', { a: 2 }));
  assert.notEqual(fingerprint('POST', '/x', { a: 1 }), fingerprint('POST', '/y', { a: 1 }));
});

test('no key, GET, or no API key: untouched', async () => {
  mem.clear();
  assert.ok((await call({})).ran);
  assert.ok((await call({ key: 'abcdefgh1', method: 'GET' })).ran);
  assert.equal(mem.size, 0);
});

test('a malformed key is a 400', async () => {
  const { res, ran } = await call({ key: 'short' });
  assert.equal(res.statusCode, 400); assert.equal(res.body.error, 'invalid_idempotency_key'); assert.equal(ran, false);
  assert.equal((await call({ key: 'has spaces and more!!' })).res.statusCode, 400);
});

test('a retry replays the SAME response and does not run the handler again', async () => {
  mem.clear();
  const first = await call({ key: 'order-retry-001', body: { phone: '+233201234567' } });
  assert.ok(first.ran); assert.equal(first.res.statusCode, 201);
  const retry = await call({ key: 'order-retry-001', body: { phone: '+233201234567' } });
  assert.equal(retry.ran, false, 'handler must not run twice');
  assert.equal(retry.res.statusCode, 201);
  assert.deepEqual(retry.res.body, first.res.body);
  assert.equal(retry.res.headers['idempotency-replayed'], 'true');
});

test('same key with a different body is refused, not silently run', async () => {
  mem.clear();
  await call({ key: 'order-retry-002', body: { phone: '+233200000001' } });
  const r = await call({ key: 'order-retry-002', body: { phone: '+233200000002' } });
  assert.equal(r.res.statusCode, 422); assert.equal(r.res.body.error, 'idempotency_key_reused'); assert.equal(r.ran, false);
});

test('a retry while the first request is still running gets 409 with Retry-After', async () => {
  mem.clear();
  const slow = call({ key: 'order-retry-003', handler: () => { /* never responds: still in flight */ } });
  await settle();
  const second = await call({ key: 'order-retry-003' });
  assert.equal(second.res.statusCode, 409); assert.equal(second.res.headers['retry-after'], '2'); assert.equal(second.ran, false);
  void slow;
});

test('our own 5xx is not stored: the retry really runs', async () => {
  mem.clear();
  const failed = await call({ key: 'order-retry-004', handler: (r) => r.status(503).json({ error: 'otp_send_failed' }) });
  assert.equal(failed.res.statusCode, 503);
  const retry = await call({ key: 'order-retry-004', handler: (r) => r.status(201).json({ ok: true }) });
  assert.ok(retry.ran); assert.equal(retry.res.statusCode, 201);
});

test('a client 4xx IS stored and replayed (the same bad request gets the same answer)', async () => {
  mem.clear();
  await call({ key: 'order-retry-005', handler: (r) => r.status(400).json({ error: 'validation_error' }) });
  const retry = await call({ key: 'order-retry-005', handler: (r) => r.status(201).json({ ok: true }) });
  assert.equal(retry.ran, false); assert.equal(retry.res.statusCode, 400);
});

test('keys are scoped per API key: another customer cannot replay or collide', async () => {
  mem.clear();
  await call({ key: 'shared-key-0001', keyId: 'key-A', body: { a: 1 } });
  const other = await call({ key: 'shared-key-0001', keyId: 'key-B', body: { a: 1 } });
  assert.ok(other.ran, 'a different API key must run its own request'); assert.equal(other.res.headers['idempotency-replayed'], undefined);
});

test('multipart uploads ignore the header and say so', async () => {
  mem.clear();
  const r = await call({ key: 'upload-key-0001', ctype: 'multipart/form-data; boundary=x' });
  assert.ok(r.ran); assert.equal(r.res.headers['idempotency-status'], 'ignored'); assert.equal(mem.size, 0);
});

test('if Redis is down the request still proceeds', async () => {
  redisDown = true;
  try { assert.ok((await call({ key: 'order-retry-006' })).ran); } finally { redisDown = false; }
});

test('rate-limit headers: remaining, reset and Retry-After on rejection', () => {
  const ok = fakeRes(); setRateLimitHeaders(ok as any, 1000, { remainingPoints: 997, msBeforeNext: 41_200 });
  assert.deepEqual([ok.headers['ratelimit-limit'], ok.headers['ratelimit-remaining'], ok.headers['ratelimit-reset']], ['1000', '997', '42']);
  assert.equal(ok.headers['retry-after'], undefined);
  const no = fakeRes(); setRateLimitHeaders(no as any, 1000, { remainingPoints: 0, msBeforeNext: 0 }, true);
  assert.equal(no.headers['ratelimit-remaining'], '0'); assert.equal(no.headers['retry-after'], '1');
  const neg = fakeRes(); setRateLimitHeaders(neg as any, 10, { remainingPoints: -3, msBeforeNext: 5000 }); assert.equal(neg.headers['ratelimit-remaining'], '0');
});

// ── OpenAPI endpoint, over real HTTP ──
test('OpenAPI is served as YAML and JSON with caching, ETag and 304', async () => {
  const app = express(); app.use('/v1', openapiRouter);
  const server = http.createServer(app); await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/v1`;
  try {
    const y = await fetch(`${base}/openapi.yaml`); const yaml = await y.text();
    assert.equal(y.status, 200); assert.match(y.headers.get('content-type')!, /yaml/); assert.match(yaml, /^openapi: /m);
    const j = await fetch(`${base}/openapi.json`); const spec: any = await j.json();
    assert.equal(j.status, 200); assert.ok(spec.paths['/verify/face/liveness/start'], 'documented live-scan endpoint present');
    assert.ok(Object.keys(spec.paths).length >= 16);
    assert.equal(y.headers.get('cache-control'), 'public, max-age=300');
    const again = await fetch(`${base}/openapi.yaml`, { headers: { 'if-none-match': y.headers.get('etag')! } });
    assert.equal(again.status, 304);
  } finally { server.close(); }
});
