/**
 * Idempotency-Key for authenticated, mutating JSON requests (the same contract integrators know from Stripe).
 *
 * A client that times out and retries POST /verify/initiate must not create a second session and bill twice.
 * Send `Idempotency-Key: <8-128 chars>`; the first request runs, and for 24 hours any retry with the same key
 * and the same body gets the SAME response back (header `Idempotency-Replayed: true`) without running again.
 *   - same key, different body  -> 422 idempotency_key_reused (a client bug: never silently run it)
 *   - same key while the first is still running -> 409 idempotency_in_progress (+ Retry-After)
 *   - a 5xx result is NOT stored, so a retry after our failure really retries
 * Keys are scoped per API key. Multipart uploads are not fingerprinted and ignore the header
 * (answered with `Idempotency-Status: ignored`). If Redis is unavailable the request simply proceeds.
 */
import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import redis from '../redis';
import logger from '../utils/logger';
import '../types'; // brings in the Express Request.apiKey augmentation (also when this file is compiled on its own)

const KEY_RE = /^[A-Za-z0-9_\-:.]{8,128}$/;
const DONE_TTL_SECONDS = 24 * 60 * 60;
const IN_PROGRESS_TTL_SECONDS = 120;
const METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

export function fingerprint(method: string, path: string, body: unknown): string {
  return createHash('sha256').update(`${method}\n${path}\n${stableStringify(body ?? {})}`).digest('hex');
}

interface Stored { state: 'in_progress' | 'done'; fp: string; status?: number; body?: unknown }

export async function idempotency(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = req.header('idempotency-key');
  if (!key || !METHODS.has(req.method) || !req.apiKey) { next(); return; }
  if (!KEY_RE.test(key)) {
    res.status(400).json({ error: 'invalid_idempotency_key', message: 'Idempotency-Key must be 8-128 characters: letters, digits, _ - : .' });
    return;
  }
  if ((req.headers['content-type'] ?? '').startsWith('multipart/')) {
    res.setHeader('Idempotency-Status', 'ignored');
    next();
    return;
  }

  const rkey = `idem:${req.apiKey.id}:${createHash('sha256').update(key).digest('hex')}`;
  const fp = fingerprint(req.method, req.baseUrl + req.path, req.body);

  let claimed: unknown;
  try {
    claimed = await redis.set(rkey, JSON.stringify({ state: 'in_progress', fp } satisfies Stored), 'EX', IN_PROGRESS_TTL_SECONDS, 'NX');
  } catch (err) {
    logger.warn(`Idempotency unavailable, proceeding without it: ${(err as Error).message}`);
    next();
    return;
  }

  if (claimed !== 'OK') {
    let existing: Stored | null = null;
    try { existing = JSON.parse((await redis.get(rkey)) ?? 'null') as Stored | null; } catch { /* treat as gone */ }
    if (!existing) { next(); return; }                                   // expired between SET and GET: just run it
    if (existing.fp !== fp) {
      res.status(422).json({ error: 'idempotency_key_reused', message: 'This Idempotency-Key was already used with a different request.' });
      return;
    }
    if (existing.state === 'in_progress') {
      res.setHeader('Retry-After', '2');
      res.status(409).json({ error: 'idempotency_in_progress', message: 'A request with this Idempotency-Key is still being processed. Retry shortly.' });
      return;
    }
    res.setHeader('Idempotency-Replayed', 'true');
    res.status(existing.status ?? 200).json(existing.body);
    return;
  }

  // We own the key: capture what this request returns so a retry can replay it.
  let captured: { status: number; body: unknown } | null = null;
  const origJson = res.json.bind(res);
  res.json = ((body?: unknown) => { captured = { status: res.statusCode, body }; return origJson(body); }) as Response['json'];
  res.on('finish', () => {
    void (async () => {
      try {
        if (captured && captured.status < 500) {
          await redis.set(rkey, JSON.stringify({ state: 'done', fp, status: captured.status, body: captured.body } satisfies Stored), 'EX', DONE_TTL_SECONDS);
        } else {
          await redis.del(rkey);                                          // our failure: let the client's retry run for real
        }
      } catch (err) {
        logger.warn(`Idempotency store failed: ${(err as Error).message}`);
      }
    })();
  });
  next();
}
