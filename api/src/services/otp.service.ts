import twilio from 'twilio';
import axios from 'axios';
import { createHash } from 'crypto';
import redis from '../redis';
import { query } from '../db';
import logger from '../utils/logger';

function maskPhone(phone: string): string {
  return `${phone.substring(0, 4)}****${phone.slice(-3)}`;
}

// Each provider below is a plain "send this text message" call - none of
// them own the verification state. The 6-digit code is generated and
// hashed by the caller (routes/verify.ts) and checked against
// verification_sessions.otp_hash, so swapping/adding/removing a provider
// here never touches how a code is confirmed.

async function sendViaTwilio(phone: string, message: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) throw new Error('Twilio not configured');

  const client = twilio(sid, token);
  await client.messages.create({ to: phone, from, body: message });
}

async function sendViaTermii(phone: string, message: string): Promise<void> {
  const apiKey = process.env.TERMII_API_KEY;
  if (!apiKey) throw new Error('Termii not configured');

  const res = await axios.post(
    'https://api.ng.termii.com/api/sms/send',
    {
      api_key: apiKey,
      to: phone,
      from: process.env.TERMII_SENDER_ID ?? 'AfriVerify',
      sms: message,
      type: 'plain',
      channel: 'dnd',
    },
    { timeout: 10000 },
  );
  if (res.data?.code && res.data.code !== 'ok') {
    throw new Error(`Termii send failed: ${JSON.stringify(res.data)}`);
  }
}

async function sendViaAfricasTalking(phone: string, message: string): Promise<void> {
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  const username = process.env.AFRICASTALKING_USERNAME;
  if (!apiKey || !username) throw new Error("Africa's Talking not configured");

  const isSandbox = username === 'sandbox';
  const url = isSandbox
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';

  const params = new URLSearchParams({ username, to: phone, message });
  if (process.env.AFRICASTALKING_SENDER_ID) params.set('from', process.env.AFRICASTALKING_SENDER_ID);

  let res;
  try {
    res = await axios.post(url, params, {
      headers: { apiKey, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      timeout: 10000,
    });
  } catch (err) {
    // A non-2xx (bad API key, wrong username, account not active, etc.) throws
    // before we ever see a recipients array - the response body here is the
    // actual reason, not the generic "Request failed with status code 401".
    const data = (err as { response?: { status?: number; data?: unknown } }).response;
    throw new Error(
      `Africa's Talking HTTP ${data?.status ?? '?'}: ${JSON.stringify(data?.data ?? (err as Error).message)}`,
    );
  }

  const recipients = res.data?.SMSMessageData?.Recipients as
    | Array<{ status: string; statusCode?: number; number?: string }>
    | undefined;
  if (!recipients?.length || !recipients.every((r) => r.status === 'Success')) {
    const reasons = recipients?.length
      ? recipients.map((r) => `${r.number ?? '?'}: ${r.status}${r.statusCode !== undefined ? ` (code ${r.statusCode})` : ''}`).join('; ')
      : `no recipients in response: ${JSON.stringify(res.data)}`;
    throw new Error(`Africa's Talking rejected: ${reasons}`);
  }
}

type ProviderId = 'africastalking' | 'termii' | 'twilio';

interface Provider {
  id: ProviderId;
  name: string;
  configured: () => boolean;
  send: (phone: string, message: string) => Promise<void>;
}

const PROVIDERS: Record<ProviderId, Provider> = {
  africastalking: {
    id: 'africastalking', name: "Africa's Talking", send: sendViaAfricasTalking,
    configured: () => !!process.env.AFRICASTALKING_API_KEY && !!process.env.AFRICASTALKING_USERNAME,
  },
  termii: { id: 'termii', name: 'Termii', send: sendViaTermii, configured: () => !!process.env.TERMII_API_KEY },
  twilio: {
    id: 'twilio', name: 'Twilio', send: sendViaTwilio,
    configured: () => !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_FROM_NUMBER,
  },
};

// ─── Routing ──────────────────────────────────────────────────────────────────
// Cheapest sensible provider first for the destination, Twilio (priciest in Africa) always last.
// Override with SMS_ROUTES, e.g. {"234":["termii","africastalking"],"default":["africastalking","termii"]}
const DEFAULT_ROUTES: Record<string, ProviderId[]> = {
  '234': ['termii', 'africastalking', 'twilio'],
  default: ['africastalking', 'termii', 'twilio'],
};

function loadRoutes(): Record<string, ProviderId[]> {
  const raw = process.env.SMS_ROUTES;
  if (!raw) return DEFAULT_ROUTES;
  try {
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    const out: Record<string, ProviderId[]> = { ...DEFAULT_ROUTES };
    for (const [k, v] of Object.entries(parsed)) {
      const ids = v.filter((x): x is ProviderId => x in PROVIDERS);
      if (ids.length) out[k] = ids;
    }
    return out;
  } catch {
    logger.warn('SMS_ROUTES is not valid JSON; using default routes');
    return DEFAULT_ROUTES;
  }
}

/** Longest matching country-calling-code prefix (1-4 digits) wins; otherwise the default route. */
export function routeFor(phone: string, routes: Record<string, ProviderId[]> = loadRoutes()): ProviderId[] {
  const digits = phone.replace(/^\+/, '');
  for (let len = 4; len >= 1; len--) {
    const hit = routes[digits.slice(0, len)];
    if (hit) return hit;
  }
  return routes.default;
}

export function countryCodeOf(phone: string, routes: Record<string, ProviderId[]> = loadRoutes()): string {
  const digits = phone.replace(/^\+/, '');
  for (let len = 4; len >= 1; len--) {
    if (routes[digits.slice(0, len)]) return digits.slice(0, len);
  }
  return digits.slice(0, 3);
}

// ─── Circuit breaker (shared across replicas via Redis) ──────────────────────
// A provider that failed 3 times in 2 minutes is skipped for the rest of that window, so one provider
// outage does not add a 10-second timeout to every verification. Redis trouble never blocks a send.
const BREAKER_THRESHOLD = 3;
const BREAKER_WINDOW_SECONDS = 120;

async function isOpen(id: ProviderId): Promise<boolean> {
  try {
    const n = Number(await redis.get(`sms:fail:${id}`));
    return n >= BREAKER_THRESHOLD;
  } catch { return false; }
}
async function recordFailure(id: ProviderId): Promise<void> {
  try {
    const key = `sms:fail:${id}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, BREAKER_WINDOW_SECONDS);
  } catch { /* breaker is best-effort */ }
}
async function recordSuccess(id: ProviderId): Promise<void> {
  try { await redis.del(`sms:fail:${id}`); } catch { /* best-effort */ }
}

/** Order the route: configured providers only, tripped ones last (still tried if nothing else works). */
export async function plan(phone: string): Promise<{ healthy: Provider[]; tripped: Provider[] }> {
  const healthy: Provider[] = [];
  const tripped: Provider[] = [];
  for (const id of routeFor(phone)) {
    const p = PROVIDERS[id];
    if (!p.configured()) continue;
    (await isOpen(id) ? tripped : healthy).push(p);
  }
  return { healthy, tripped };
}

interface Attempt { provider: string; ok: boolean; ms: number; error?: string }

async function logMessage(phone: string, provider: string | null, attempts: Attempt[]): Promise<void> {
  try {
    await query(
      `INSERT INTO sms_messages (phone_hash, phone_masked, country_code, provider, status, attempts)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        createHash('sha256').update(phone).digest('hex'),
        maskPhone(phone),
        countryCodeOf(phone),
        provider,
        provider ? 'sent' : 'failed',
        JSON.stringify(attempts),
      ]
    );
  } catch (err) {
    logger.warn(`SMS log write failed: ${(err as Error).message}`);
  }
}

/** Sends one SMS, routing by destination and failing over. Returns the provider that accepted it. */
export async function sendSms(phone: string, message: string): Promise<string> {
  const { healthy, tripped } = await plan(phone);
  const order = [...healthy, ...tripped];
  const attempts: Attempt[] = [];

  if (order.length === 0) {
    logger.error('No SMS provider is configured', { phone: maskPhone(phone) });
    await logMessage(phone, null, attempts);
    throw new Error('OTP service unavailable. Please try again shortly.');
  }

  for (const provider of order) {
    const t0 = Date.now();
    try {
      await provider.send(phone, message);
      attempts.push({ provider: provider.id, ok: true, ms: Date.now() - t0 });
      await recordSuccess(provider.id);
      await logMessage(phone, provider.id, attempts);
      logger.info(`OTP SMS sent via ${provider.name}`, { phone: maskPhone(phone) });
      return provider.id;
    } catch (err) {
      const msg = (err as Error).message;
      attempts.push({ provider: provider.id, ok: false, ms: Date.now() - t0, error: msg.slice(0, 300) });
      await recordFailure(provider.id);
      // The reason goes in the message string itself: Railway's log viewer shows only the message by default.
      logger.warn(`${provider.name} SMS send failed, trying next provider: ${msg}`, { phone: maskPhone(phone) });
    }
  }
  await logMessage(phone, null, attempts);
  logger.error(`All SMS providers failed: ${attempts.map((a) => `${a.provider}: ${a.error}`).join(' | ')}`, { phone: maskPhone(phone) });
  throw new Error('OTP service unavailable. Please try again shortly.');
}
