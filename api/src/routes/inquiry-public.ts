/**
 * /v1/public/inquiries/* - the public side of shareable inquiry links.
 * No credentials: the slug is the credential, so every request re-checks the link
 * (active, not expired, not used up) and the start endpoint is rate limited per IP,
 * per link and per phone, because it is reachable by anyone on the internet.
 * It creates an ordinary verification session; the hosted flow then sends the OTP
 * (itself capped per session) and runs the steps.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createHash } from 'crypto';
import redis from '../redis';
import { query, queryOne } from '../db';
import { validateBody } from '../middleware/validate';
import { checkBlacklist } from '../services/blacklist.service';
import { recordUsage } from '../services/billing.service';
import { evaluateNetworkRisk } from '../services/orbitshield/fraud-graph.service';
import { livenessEnabled } from '../services/liveness.service';
import { generateSecureToken } from '../utils/crypto';
import logger from '../utils/logger';

const router = Router();

const NETWORK_RISK_BLOCK_THRESHOLD = 70;
const LIMITS = { ipPerHour: 10, linkPerHour: 300, phonePerHour: 3 };
const SLUG = /^[A-Za-z0-9_-]{8,32}$/;

interface LinkRow {
  id: string; label: string; description: string | null; allowed_id_types: string[];
  require_liveness: boolean; redirect_url: string | null; status: string;
  max_uses: number | null; current_uses: number; expires_at: string | null;
  api_key_id: string; company_name: string; logo_url: string | null; primary_color: string;
}

async function loadLink(slug: string): Promise<LinkRow | null> {
  if (!SLUG.test(slug)) return null;
  return queryOne<LinkRow>(
    `SELECT il.id, il.label, il.description, il.allowed_id_types, il.require_liveness, il.redirect_url,
            il.status::text, il.max_uses, il.current_uses, il.expires_at, il.api_key_id,
            COALESCE(wl.company_name, ak.platform_name) AS company_name, wl.logo_url,
            COALESCE(wl.primary_color, '#C9960E') AS primary_color
     FROM inquiry_links il
     JOIN api_keys ak ON ak.id = il.api_key_id AND ak.is_active = true
     LEFT JOIN white_label_configs wl ON wl.developer_email = il.developer_email
     WHERE il.slug = $1`,
    [slug]
  );
}

function availability(l: LinkRow): 'ok' | 'revoked' | 'expired' | 'full' {
  if (l.status === 'revoked') return 'revoked';
  if (l.status === 'expired' || (l.expires_at && new Date(l.expires_at) <= new Date())) return 'expired';
  if (l.status === 'completed' || (l.max_uses !== null && l.current_uses >= l.max_uses)) return 'full';
  return 'ok';
}

/** Fixed-window counter shared by all replicas. Fails CLOSED: this endpoint can trigger paid SMS downstream. */
async function underLimit(scope: string, id: string, max: number, windowSec: number): Promise<boolean> {
  try {
    const key = `inq:rl:${scope}:${createHash('sha256').update(id).digest('hex').slice(0, 24)}:${Math.floor(Date.now() / (windowSec * 1000))}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowSec + 60);
    return n <= max;
  } catch {
    return false;
  }
}

// GET /v1/public/inquiries/:slug
router.get('/:slug', async (req: Request, res: Response): Promise<void> => {
  const link = await loadLink(String(req.params.slug));
  if (!link) { res.status(404).json({ error: 'not_found', message: 'This verification link does not exist.' }); return; }
  const state = availability(link);
  res.json({
    available: state === 'ok',
    unavailable_reason: state === 'ok' ? null : state,
    label: link.label,
    description: link.description,
    company_name: link.company_name,
    logo_url: link.logo_url,
    primary_color: link.primary_color,
    allowed_id_types: link.allowed_id_types,
    liveness_required: link.require_liveness && livenessEnabled(),
  });
});

const startSchema = z.object({
  phone: z.string().min(7).max(20).regex(/^\+?[1-9]\d{6,19}$/, 'Invalid phone number'),
  email: z.string().email().max(255).optional(),
  otp_channel: z.enum(['sms', 'email']).optional().default('sms'),
  lang: z.enum(['en', 'fr']).optional().default('en'),
}).refine((d) => d.otp_channel !== 'email' || !!d.email, { message: 'email is required when otp_channel is "email"', path: ['email'] });

// POST /v1/public/inquiries/:slug/start
router.post('/:slug/start', validateBody(startSchema), async (req: Request, res: Response): Promise<void> => {
  const { phone, email, otp_channel, lang } = req.body as z.infer<typeof startSchema>;
  const slug = String(req.params.slug);
  const ip = req.ip ?? 'unknown';

  const link = await loadLink(slug);
  if (!link) { res.status(404).json({ error: 'not_found', message: 'This verification link does not exist.' }); return; }
  const state = availability(link);
  if (state !== 'ok') { res.status(410).json({ error: 'link_unavailable', reason: state, message: 'This verification link is no longer available.' }); return; }

  const tooMany = (msg: string) => res.status(429).json({ error: 'rate_limited', message: msg });
  if (!(await underLimit('ip', ip, LIMITS.ipPerHour, 3600))) { tooMany('Too many attempts from this network. Try again later.'); return; }
  if (!(await underLimit('link', slug, LIMITS.linkPerHour, 3600))) { tooMany('This link is receiving too many requests. Try again later.'); return; }
  if (!(await underLimit('phone', `${slug}:${phone}`, LIMITS.phonePerHour, 3600))) { tooMany('Too many attempts for this phone number. Try again later.'); return; }

  if (link.require_liveness && !livenessEnabled()) {
    res.status(501).json({ error: 'liveness_unavailable', message: 'Live face scanning is not available right now. Please try again later.' });
    return;
  }

  const key = await queryOne<{ tier: string; verifications_this_month: number; monthly_limit: number }>(
    'SELECT tier, verifications_this_month, monthly_limit FROM api_keys WHERE id = $1', [link.api_key_id]
  );
  if (!key || (key.tier === 'free' && key.verifications_this_month >= key.monthly_limit)) {
    res.status(402).json({ error: 'limit_exceeded', message: 'This link has reached its verification limit.' });
    return;
  }

  const blocked = { error: 'identity_blocked', message: 'This number is not eligible for verification.' };
  const bl = await checkBlacklist({ phone });
  if (bl.blacklisted && bl.scope === 'global') { res.status(403).json(blocked); return; }
  const deviceId = (req.headers['x-device-id'] as string) ?? undefined;
  const risk = await evaluateNetworkRisk(undefined, deviceId, req.ip ?? undefined);
  if (risk.networkRiskScore >= NETWORK_RISK_BLOCK_THRESHOLD) { res.status(403).json(blocked); return; }

  // Atomic claim of one use: concurrent requests can never exceed max_uses.
  const claimed = await query<{ id: string }>(
    `UPDATE inquiry_links SET current_uses = current_uses + 1
     WHERE id = $1 AND status = 'active'
       AND (max_uses IS NULL OR current_uses < max_uses)
       AND (expires_at IS NULL OR expires_at > NOW())
     RETURNING id`,
    [link.id]
  );
  if (!claimed.length) { res.status(410).json({ error: 'link_unavailable', reason: 'full', message: 'This verification link is no longer available.' }); return; }

  const sessionToken = generateSecureToken(32);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  try {
    const rows = await query<{ id: string }>(
      `INSERT INTO verification_sessions
         (session_token, phone, email, otp_channel, step, api_key_id, ip_address, device_id, expires_at, lang, liveness_required, redirect_url, inquiry_id)
       VALUES ($1,$2,$3,$4,'phone',$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [sessionToken, phone, email ?? null, otp_channel, link.api_key_id, req.ip ?? null, deviceId ?? null, expiresAt, lang,
       livenessEnabled() && link.require_liveness, link.redirect_url, link.id]
    );
    await query(
      `INSERT INTO inquiry_submissions (inquiry_id, session_id, ip_hash) VALUES ($1,$2,$3)`,
      [link.id, rows[0].id, createHash('sha256').update(ip).digest('hex')]
    );
  } catch (err) {
    // give the claimed use back so a failure never burns the link's quota
    await query('UPDATE inquiry_links SET current_uses = GREATEST(current_uses - 1, 0) WHERE id = $1', [link.id]).catch(() => {});
    logger.error('Inquiry start failed', { error: (err as Error).message, inquiry: link.id });
    res.status(500).json({ error: 'start_failed', message: 'Could not start verification. Please try again.' });
    return;
  }

  await query('UPDATE api_keys SET verifications_this_month = verifications_this_month + 1 WHERE id = $1', [link.api_key_id]);
  await recordUsage(link.api_key_id, 'level1').catch(() => {});

  res.status(201).json({ session_token: sessionToken, expires_at: expiresAt.toISOString(), next_step: 'otp' });
});

export default router;
