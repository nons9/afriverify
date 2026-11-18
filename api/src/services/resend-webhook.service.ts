/**
 * Resend delivery webhooks (Svix-signed): verify, record, alert.
 * Resend accepts an email and then reports bounces/complaints/failures asynchronously;
 * without this, AfriVerify never learns that an OTP or billing email did not arrive.
 */
import crypto from 'crypto';
import { query } from '../db';
import { sha256 } from '../utils/crypto';
import { sendOpsAlert } from './alerting.service';
import { claimCooldown } from '../utils/metrics';
import logger from '../utils/logger';

const TOLERANCE_SECONDS = 5 * 60;

// ─── Signature verification (Svix scheme) ────────────────────────────────────

export interface SvixHeaders {
  id?: string;
  timestamp?: string;
  signature?: string;
}

/**
 * signed content = `${svix-id}.${svix-timestamp}.${rawBody}`, HMAC-SHA256 with the base64 key
 * from the `whsec_...` secret. The header may carry several space-separated `v1,<base64>` signatures
 * (key rotation); any one valid match passes. Stale timestamps are rejected to block replays.
 */
export function verifySvixSignature(
  rawBody: Buffer,
  headers: SvixHeaders,
  secret: string,
  nowMs: number = Date.now()
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature || !secret) return false;

  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  if (key.length === 0) return false;

  const expected = crypto
    .createHmac('sha256', key)
    .update(`${headers.id}.${headers.timestamp}.`)
    .update(rawBody)
    .digest();

  for (const part of headers.signature.split(' ')) {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) continue;
    const given = Buffer.from(sig, 'base64');
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) return true;
  }
  return false;
}

// ─── Event handling ──────────────────────────────────────────────────────────

export interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    subject?: string;
    bounce?: { type?: string; subType?: string; message?: string };
    failed?: { reason?: string };
    [k: string]: unknown;
  };
}

export function maskRecipient(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

const RECORDED_TYPES = new Set([
  'email.bounced', 'email.complained', 'email.failed', 'email.delivery_delayed', 'email.suppressed',
]);
// These hurt sender reputation or mean a user did not get their code: page someone.
const ALERT_TYPES = new Set(['email.bounced', 'email.complained', 'email.failed']);
const ALERT_COOLDOWN_MS = 10 * 60 * 1000;

export function isPermanentBounce(ev: ResendEvent): boolean {
  return ev.type === 'email.bounced' && (ev.data?.bounce?.type ?? '').toLowerCase() === 'permanent';
}

/** Records the event (idempotent on svix id). Returns true when newly stored. */
export async function recordResendEvent(svixId: string, ev: ResendEvent): Promise<boolean> {
  const type = ev.type ?? '';
  if (!RECORDED_TYPES.has(type)) return false;

  const to = Array.isArray(ev.data?.to) ? ev.data!.to[0] : ev.data?.to;
  const rows = await query<{ id: string }>(
    `INSERT INTO email_events
       (svix_id, resend_email_id, event_type, recipient_hash, recipient_masked, subject,
        bounce_type, bounce_subtype, reason, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (svix_id) DO NOTHING
     RETURNING id`,
    [
      svixId,
      ev.data?.email_id ?? null,
      type,
      to ? sha256(to.trim().toLowerCase()) : null,
      to ? maskRecipient(to) : null,
      ev.data?.subject?.slice(0, 255) ?? null,
      ev.data?.bounce?.type ?? null,
      ev.data?.bounce?.subType ?? null,
      (ev.data?.bounce?.message ?? ev.data?.failed?.reason ?? '').slice(0, 1000) || null,
      ev.created_at ? new Date(ev.created_at) : null,
    ]
  );
  const stored = rows.length > 0;

  if (stored && ALERT_TYPES.has(type)) {
    const key = type + (isPermanentBounce(ev) ? ':permanent' : '');
    if (await claimCooldown(`resend:${key}`, ALERT_COOLDOWN_MS / 1000)) {
      const what = isPermanentBounce(ev) ? 'permanent bounce' : type.replace('email.', '');
      await sendOpsAlert(
        `AfriVerify email: ${what}${ev.data?.subject ? ` on "${ev.data.subject}"` : ''}` +
          `${to ? ` (to ${maskRecipient(to)})` : ''}. Check the email_events table / Resend dashboard.`
      );
    }
  }
  logger.info('Resend event recorded', { type, stored });
  return stored;
}
