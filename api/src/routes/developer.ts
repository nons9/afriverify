import { Router, Request, Response } from 'express';
import { randomBytes, createHmac } from 'crypto';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { sessionAuth } from '../middleware/sessionAuth';
import { validateBody } from '../middleware/validate';
import { query, queryOne } from '../db';
import { generateApiKey, encryptString, getDataEncryptionKey, sha256 } from '../utils/crypto';
import { verifyAfriAppKey } from '../services/afriapp-verify.service';
import logger from '../utils/logger';

const router = Router();

const createKeySchema = z.object({
  platform_name: z.string().min(2).max(100),
  platform_email: z.string().email(),
  environment: z.enum(['sandbox', 'production']).default('sandbox'),
  scope: z.string().max(64).default('full'),
  intent: z.string().max(255).optional(),
  allowed_flows: z.array(z.string()).default(['kyc', 'trust', 'aml']),
  expires_at: z.string().datetime().optional(),
});

// POST /developer/keys - public bootstrap (no auth required)
router.post(
  '/keys',
  validateBody(createKeySchema),
  async (req: Request, res: Response): Promise<void> => {
    const { platform_name, platform_email, environment, scope, intent, allowed_flows, expires_at } =
      req.body as z.infer<typeof createKeySchema>;

    const { key, hash, prefix } = generateApiKey(environment);

    const rows = await query<{ id: string }>(
      `INSERT INTO api_keys
         (platform_name, platform_email, api_key_hash, api_key_prefix, environment,
          tier, monthly_limit, scope, intent, allowed_flows, expires_at)
       VALUES ($1,$2,$3,$4,$5,'free',100,$6,$7,$8,$9)
       RETURNING id`,
      [platform_name, platform_email, hash, prefix, environment,
       scope, intent ?? null, JSON.stringify(allowed_flows), expires_at ?? null]
    );

    logger.info('New API key created', { platform: platform_name, environment, scope, id: rows[0].id });

    res.status(201).json({
      api_key: key,
      prefix,
      environment,
      tier: 'free',
      monthly_limit: 100,
      scope,
      intent: intent ?? null,
      allowed_flows,
      expires_at: expires_at ?? null,
      message: 'Store this API key securely. It will NOT be shown again.',
      id: rows[0].id
    });
  }
);

// GET /developer/keys - list all keys for the signed-in developer (session auth)
router.get('/keys', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const keys = await query<{
    id: string;
    platform_name: string;
    api_key_prefix: string;
    environment: string;
    tier: string;
    monthly_limit: number;
    verifications_this_month: number;
    last_used: string | null;
    is_active: boolean;
    created_at: string;
    webhook_url: string | null;
    ussd_service_code: string | null;
    scope: string;
    intent: string | null;
    allowed_flows: string[];
    parent_key_id: string | null;
    expires_at: string | null;
    subkey_count: number;
  }>(
    `SELECT k.id, k.platform_name, k.api_key_prefix, k.environment, k.tier, k.monthly_limit,
            k.verifications_this_month, k.last_used, k.is_active, k.created_at,
            k.webhook_url, k.ussd_service_code, k.scope, k.intent, k.allowed_flows,
            k.parent_key_id, k.expires_at,
            COUNT(s.id)::int AS subkey_count
     FROM api_keys k
     LEFT JOIN api_keys s ON s.parent_key_id = k.id AND s.is_active = true
     WHERE k.platform_email = $1
     GROUP BY k.id
     ORDER BY k.created_at DESC`,
    [req.developer!.email]
  );

  res.json({ keys });
});

// DELETE /developer/keys/:id - revoke a key (session auth)
router.delete('/keys/:id', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const result = await query<{ id: string }>(
    `UPDATE api_keys SET is_active = false
     WHERE id = $1 AND platform_email = $2 AND is_active = true
     RETURNING id`,
    [id, req.developer!.email]
  );

  if (result.length === 0) {
    res.status(404).json({ error: 'not_found', message: 'Key not found or already revoked' });
    return;
  }

  logger.info('API key revoked', { id });
  res.json({ success: true });
});

// GET /developer/overview - dashboard summary (session auth)
router.get('/overview', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const email = req.developer!.email;

  const [keyStats, recentEvents, fraudStats] = await Promise.all([
    queryOne<{ total_keys: string; active_keys: string; total_verifications: string; has_production: string }>(
      `SELECT
         COUNT(*) as total_keys,
         COUNT(*) FILTER (WHERE is_active = true) as active_keys,
         COALESCE(SUM(verifications_this_month), 0) as total_verifications,
         COUNT(*) FILTER (WHERE environment = 'production') as has_production
       FROM api_keys WHERE platform_email = $1`,
      [email]
    ),
    query<{ type: string; created_at: string }>(
      `SELECT ve.event_type AS type, ve.created_at
       FROM verification_events ve
       JOIN api_keys ak ON ak.id = ve.api_key_id
       WHERE ak.platform_email = $1
       ORDER BY ve.created_at DESC LIMIT 10`,
      [email]
    ),
    queryOne<{ fraud_flags: string }>(
      `SELECT COUNT(*) as fraud_flags
       FROM blacklist b
       JOIN api_keys ak ON ak.platform_name = b.reported_by_platform
       WHERE ak.platform_email = $1`,
      [email]
    )
  ]);

  const hasProduction = parseInt(keyStats?.has_production ?? '0') > 0;
  res.json({
    total_keys: parseInt(keyStats?.total_keys ?? '0'),
    active_keys: parseInt(keyStats?.active_keys ?? '0'),
    total_verifications: parseInt(keyStats?.total_verifications ?? '0'),
    recent_events: recentEvents,
    environment: hasProduction ? 'production' : 'sandbox',
    fraud_flags: parseInt(fraudStats?.fraud_flags ?? '0'),
  });
});

// GET /developer/usage - per-key usage stats (API key auth)
router.get('/usage', authenticate, async (req: Request, res: Response): Promise<void> => {
  const apiKey = req.apiKey!;

  const today = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM verification_events
     WHERE api_key_id = $1 AND created_at >= CURRENT_DATE`,
    [apiKey.id]
  );

  const used = apiKey.verifications_this_month;
  const limit = apiKey.monthly_limit;
  const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;

  res.json({
    platform: apiKey.platform_name,
    environment: apiKey.environment,
    tier: apiKey.tier,
    verifications_today: parseInt(today?.count ?? '0'),
    verifications_this_month: used,
    monthly_limit: limit,
    percentage_used: pct,
    overage_warning: pct >= 80
  });
});

// GET /developer/usage/daily - last-7-days per-day breakdown (session auth)
router.get('/usage/daily', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const email = req.developer!.email;
  const rows = await query<{ day: string; calls: number }>(
    `SELECT DATE(ve.created_at)::text AS day, COUNT(*)::int AS calls
     FROM verification_events ve
     JOIN api_keys ak ON ak.id = ve.api_key_id
     WHERE ak.platform_email = $1
       AND ve.created_at >= NOW() - INTERVAL '7 days'
     GROUP BY DATE(ve.created_at)
     ORDER BY day ASC`,
    [email]
  );
  res.json({ daily: rows });
});

// GET /developer/metrics: event-type success/failure breakdown, last 7 days (session auth)
router.get('/metrics', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const email = req.developer!.email;
  const rows = await query<{ event_type: string; result: string; count: number }>(
    `SELECT ve.event_type::text, ve.result::text, COUNT(*)::int AS count
     FROM verification_events ve
     JOIN api_keys ak ON ak.id = ve.api_key_id
     WHERE ak.platform_email = $1
       AND ve.created_at >= NOW() - INTERVAL '7 days'
     GROUP BY ve.event_type, ve.result
     ORDER BY ve.event_type`,
    [email]
  );

  const byEventType: Record<string, { passed: number; failed: number; flagged: number; pending: number; total: number }> = {};
  for (const row of rows) {
    const bucket = (byEventType[row.event_type] ??= { passed: 0, failed: 0, flagged: 0, pending: 0, total: 0 });
    bucket[row.result as 'passed' | 'failed' | 'flagged' | 'pending'] = row.count;
    bucket.total += row.count;
  }

  res.json({ window: '7d', metrics: byEventType });
});

// PATCH /developer/keys/:id/webhook - set or clear webhook URL (session auth)
const webhookUrlSchema = z.object({
  webhook_url: z.string().url().max(2048).nullable()
});

router.patch('/keys/:id/webhook', sessionAuth, validateBody(webhookUrlSchema), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { webhook_url } = req.body as z.infer<typeof webhookUrlSchema>;

  const result = await query<{ id: string }>(
    `UPDATE api_keys SET webhook_url = $1
     WHERE id = $2 AND platform_email = $3 AND is_active = true
     RETURNING id`,
    [webhook_url ?? null, id, req.developer!.email]
  );

  if (result.length === 0) {
    res.status(404).json({ error: 'not_found', message: 'Key not found' });
    return;
  }

  logger.info('Webhook URL updated', { id });
  res.json({ success: true });
});

// PATCH /developer/keys/:id/ussd-code: set or clear the USSD short code this key answers on (session auth)
const ussdCodeSchema = z.object({
  ussd_service_code: z.string().regex(/^\*\d+(\*\d+)*#$/, 'Must look like a USSD code, e.g. *384*1234#').nullable()
});

router.patch('/keys/:id/ussd-code', sessionAuth, validateBody(ussdCodeSchema), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { ussd_service_code } = req.body as z.infer<typeof ussdCodeSchema>;

  try {
    const result = await query<{ id: string }>(
      `UPDATE api_keys SET ussd_service_code = $1
       WHERE id = $2 AND platform_email = $3 AND is_active = true
       RETURNING id`,
      [ussd_service_code ?? null, id, req.developer!.email]
    );

    if (result.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Key not found' });
      return;
    }

    logger.info('USSD service code updated', { id });
    res.json({ success: true });
  } catch (err) {
    // Unique constraint: another key already claims this code
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'conflict', message: 'That USSD code is already in use by another key' });
      return;
    }
    throw err;
  }
});

// POST /developer/keys/:id/webhook/secret - regenerate signing secret (session auth)
router.post('/keys/:id/webhook/secret', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const secret = randomBytes(32).toString('hex');
  // Unlike api_key_hash, this can't be a one-way hash: deliverWithRetry()
  // needs the plaintext back to compute each webhook's HMAC signature. It's
  // encrypted at rest instead, so a DB leak alone doesn't hand out every
  // platform's signing secret.
  const encrypted = encryptString(secret, getDataEncryptionKey());

  const result = await query<{ id: string }>(
    `UPDATE api_keys SET webhook_secret_hash = $1
     WHERE id = $2 AND platform_email = $3 AND is_active = true
     RETURNING id`,
    [encrypted, id, req.developer!.email]
  );

  if (result.length === 0) {
    res.status(404).json({ error: 'not_found', message: 'Key not found' });
    return;
  }

  logger.info('Webhook secret regenerated', { id });
  // Return the raw secret once - it will not be shown again
  res.json({ secret });
});

// POST /developer/keys/:id/rotate: issue a fresh key, retire the old one immediately (session auth)
router.post('/keys/:id/rotate', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const existing = await queryOne<{
    id: string;
    platform_name: string;
    environment: 'sandbox' | 'production';
    tier: string;
    monthly_limit: number;
    permissions: string[];
    webhook_url: string | null;
    webhook_secret_hash: string | null;
  }>(
    `SELECT id, platform_name, environment, tier, monthly_limit, permissions, webhook_url, webhook_secret_hash
     FROM api_keys WHERE id = $1 AND platform_email = $2 AND is_active = true`,
    [id, req.developer!.email]
  );

  if (!existing) {
    res.status(404).json({ error: 'not_found', message: 'Key not found or already revoked' });
    return;
  }

  const { key, hash, prefix } = generateApiKey(existing.environment);

  const rows = await query<{ id: string }>(
    `INSERT INTO api_keys
       (platform_name, platform_email, api_key_hash, api_key_prefix, environment,
        tier, monthly_limit, permissions, webhook_url, webhook_secret_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      existing.platform_name, req.developer!.email, hash, prefix, existing.environment,
      existing.tier, existing.monthly_limit, JSON.stringify(existing.permissions),
      existing.webhook_url, existing.webhook_secret_hash
    ]
  );

  // Old key stops working the moment the new one is issued. Callers using
  // the old key see the same 401 as a manual revoke, so a rotation should be
  // announced to the platform team before it's triggered, not silently timed.
  await query('UPDATE api_keys SET is_active = false WHERE id = $1', [id]);

  logger.info('API key rotated', { old_id: id, new_id: rows[0].id });

  res.status(201).json({
    api_key: key,
    prefix,
    environment: existing.environment,
    tier: existing.tier,
    monthly_limit: existing.monthly_limit,
    id: rows[0].id,
    replaced_key_id: id,
    message: 'Store this API key securely. It will NOT be shown again. The rotated key is now inactive.'
  });
});

// GET /developer/keys/:id/analytics - per-key verification breakdown (session auth)
router.get('/keys/:id/analytics', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const keyRow = await queryOne<{ id: string }>(
    'SELECT id FROM api_keys WHERE id = $1 AND platform_email = $2',
    [id, req.developer!.email]
  );
  if (!keyRow) {
    res.status(404).json({ error: 'not_found', message: 'Key not found' });
    return;
  }

  const [daily, byType, totals] = await Promise.all([
    query<{ day: string; calls: number; passed: number; failed: number }>(
      `SELECT DATE(created_at)::text AS day,
              COUNT(*)::int AS calls,
              COUNT(*) FILTER (WHERE result = 'passed')::int AS passed,
              COUNT(*) FILTER (WHERE result = 'failed')::int AS failed
       FROM verification_events
       WHERE api_key_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at) ORDER BY day ASC`,
      [id]
    ),
    query<{ event_type: string; count: number }>(
      `SELECT event_type::text, COUNT(*)::int AS count
       FROM verification_events WHERE api_key_id = $1
         AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY event_type ORDER BY count DESC`,
      [id]
    ),
    queryOne<{ total: string; passed: string; failed: string; flagged: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE result = 'passed')::text AS passed,
              COUNT(*) FILTER (WHERE result = 'failed')::text AS failed,
              COUNT(*) FILTER (WHERE result = 'flagged')::text AS flagged
       FROM verification_events WHERE api_key_id = $1`,
      [id]
    )
  ]);

  res.json({
    key_id: id,
    window: '30d',
    totals: {
      total: parseInt(totals?.total ?? '0'),
      passed: parseInt(totals?.passed ?? '0'),
      failed: parseInt(totals?.failed ?? '0'),
      flagged: parseInt(totals?.flagged ?? '0'),
    },
    daily,
    by_event_type: byType,
  });
});

// POST /developer/keys/:id/subkeys - issue a delegated sub-key (session auth)
const subkeySchema = z.object({
  platform_name: z.string().min(2).max(100),
  scope: z.string().max(64).default('delegated'),
  intent: z.string().max(255).optional(),
  allowed_flows: z.array(z.string()).optional(),
  monthly_limit: z.number().int().min(1).max(100_000).default(1000),
  expires_at: z.string().datetime().optional(),
});

router.post('/keys/:id/subkeys', sessionAuth, validateBody(subkeySchema), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { platform_name, scope, intent, allowed_flows, monthly_limit, expires_at } =
    req.body as z.infer<typeof subkeySchema>;

  const parent = await queryOne<{
    id: string; environment: 'sandbox' | 'production'; tier: string;
    allowed_flows: string[]; monthly_limit: number;
  }>(
    'SELECT id, environment, tier, allowed_flows, monthly_limit FROM api_keys WHERE id = $1 AND platform_email = $2 AND is_active = true',
    [id, req.developer!.email]
  );
  if (!parent) {
    res.status(404).json({ error: 'not_found', message: 'Parent key not found or inactive' });
    return;
  }

  // Sub-key flows are constrained to what the parent allows
  const parentFlows: string[] = Array.isArray(parent.allowed_flows) ? parent.allowed_flows : ['kyc', 'trust', 'aml'];
  const effectiveFlows: string[] = allowed_flows
    ? allowed_flows.filter((f: string) => parentFlows.includes(f))
    : parentFlows;

  const { key, hash, prefix } = generateApiKey(parent.environment);

  const rows = await query<{ id: string }>(
    `INSERT INTO api_keys
       (platform_name, platform_email, api_key_hash, api_key_prefix, environment,
        tier, monthly_limit, scope, intent, allowed_flows, parent_key_id, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      platform_name, req.developer!.email, hash, prefix, parent.environment,
      parent.tier, monthly_limit, scope, intent ?? null,
      JSON.stringify(effectiveFlows), parent.id, expires_at ?? null
    ]
  );

  logger.info('Sub-key created', { parent_id: parent.id, new_id: rows[0].id });

  res.status(201).json({
    api_key: key,
    prefix,
    id: rows[0].id,
    parent_key_id: parent.id,
    environment: parent.environment,
    scope,
    intent: intent ?? null,
    allowed_flows: effectiveFlows,
    monthly_limit,
    expires_at: expires_at ?? null,
    message: 'Store this sub-key securely. It will NOT be shown again.',
  });
});

// GET /developer/keys/:id/subkeys - list sub-keys (session auth)
router.get('/keys/:id/subkeys', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const parent = await queryOne<{ id: string }>(
    'SELECT id FROM api_keys WHERE id = $1 AND platform_email = $2',
    [id, req.developer!.email]
  );
  if (!parent) {
    res.status(404).json({ error: 'not_found', message: 'Parent key not found' });
    return;
  }

  const subkeys = await query<{
    id: string; platform_name: string; api_key_prefix: string; scope: string;
    intent: string | null; allowed_flows: string[]; monthly_limit: number;
    verifications_this_month: number; is_active: boolean; expires_at: string | null; created_at: string;
  }>(
    `SELECT id, platform_name, api_key_prefix, scope, intent, allowed_flows,
            monthly_limit, verifications_this_month, is_active, expires_at, created_at
     FROM api_keys WHERE parent_key_id = $1 ORDER BY created_at DESC`,
    [id]
  );

  res.json({ parent_key_id: id, subkeys });
});

// POST /developer/verification-tokens - issue a short-lived, single-use verification token (session auth)
const vtSchema = z.object({
  api_key_id: z.string().uuid(),
  allowed_flows: z.array(z.string()).default(['kyc']),
  ttl_seconds: z.number().int().min(60).max(86400).default(3600),
  metadata: z.record(z.unknown()).default({}),
});

router.post('/verification-tokens', sessionAuth, validateBody(vtSchema), async (req: Request, res: Response): Promise<void> => {
  const { api_key_id, allowed_flows, ttl_seconds, metadata } =
    req.body as z.infer<typeof vtSchema>;

  const keyRow = await queryOne<{ id: string; environment: string }>(
    'SELECT id, environment FROM api_keys WHERE id = $1 AND platform_email = $2 AND is_active = true',
    [api_key_id, req.developer!.email]
  );
  if (!keyRow) {
    res.status(404).json({ error: 'not_found', message: 'API key not found or inactive' });
    return;
  }

  const raw = `avt_${keyRow.environment === 'production' ? 'live' : 'test'}_${randomBytes(24).toString('hex')}`;
  const hash = sha256(raw);
  const prefix = raw.substring(0, 16);
  const expiresAt = new Date(Date.now() + ttl_seconds * 1000).toISOString();

  const rows = await query<{ id: string }>(
    `INSERT INTO verification_tokens
       (token_hash, token_prefix, api_key_id, allowed_flows, metadata, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [hash, prefix, api_key_id, JSON.stringify(allowed_flows), JSON.stringify(metadata), expiresAt]
  );

  logger.info('Verification token issued', { id: rows[0].id, api_key_id, ttl_seconds });

  res.status(201).json({
    token: raw,
    prefix,
    id: rows[0].id,
    allowed_flows,
    expires_at: expiresAt,
    message: 'This token is single-use and expires once consumed or at expires_at.',
  });
});

// GET /developer/verification-tokens - list tokens for an API key (session auth)
router.get('/verification-tokens', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const { api_key_id } = req.query as { api_key_id?: string };

  const where = api_key_id
    ? `WHERE vt.api_key_id = $2 AND ak.platform_email = $1`
    : `WHERE ak.platform_email = $1`;
  const params: unknown[] = api_key_id ? [req.developer!.email, api_key_id] : [req.developer!.email];

  const tokens = await query<{
    id: string; token_prefix: string; api_key_id: string;
    allowed_flows: string[]; used: boolean; used_at: string | null;
    expires_at: string; created_at: string;
  }>(
    `SELECT vt.id, vt.token_prefix, vt.api_key_id, vt.allowed_flows,
            vt.used, vt.used_at, vt.expires_at, vt.created_at
     FROM verification_tokens vt
     JOIN api_keys ak ON ak.id = vt.api_key_id
     ${where}
     ORDER BY vt.created_at DESC LIMIT 100`,
    params
  );

  res.json({ tokens });
});

// ─── AfriApp Store connection ────────────────────────────────────────────────

const connectAfriAppSchema = z.object({
  key: z.string().regex(/^averify_live_[0-9a-f]{48}$/, 'Key must be an AfriApp-issued averify_live_ key')
});

// POST /developer/afriapp-key - connect or replace an AfriApp key (session auth)
router.post('/afriapp-key', sessionAuth, validateBody(connectAfriAppSchema), async (req: Request, res: Response): Promise<void> => {
  const { key } = req.body as z.infer<typeof connectAfriAppSchema>;
  const email = req.developer!.email;

  let result;
  try {
    result = await verifyAfriAppKey(key);
  } catch {
    res.status(502).json({ error: 'upstream_unavailable', message: 'AfriApp verification service is currently unavailable' });
    return;
  }

  if (!result.valid) {
    res.status(422).json({ error: 'invalid_key', message: 'AfriApp returned invalid for this key - check it was copied correctly and is still active' });
    return;
  }

  const keyHash = sha256(key);

  await query(
    `INSERT INTO afriapp_connections (developer_email, afriapp_key_hash, afriapp_owner_id, last_verified_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (developer_email) DO UPDATE
       SET afriapp_key_hash = EXCLUDED.afriapp_key_hash,
           afriapp_owner_id = EXCLUDED.afriapp_owner_id,
           last_verified_at = NOW(),
           is_active        = true`,
    [email, keyHash, result.ownerId]
  );

  logger.info('AfriApp key connected', { email, ownerId: result.ownerId });
  res.json({ connected: true, ownerId: result.ownerId });
});

// GET /developer/afriapp-key - connection status (session auth)
router.get('/afriapp-key', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const row = await queryOne<{ afriapp_owner_id: string; connected_at: string; last_verified_at: string | null; is_active: boolean }>(
    `SELECT afriapp_owner_id, connected_at, last_verified_at, is_active
     FROM afriapp_connections WHERE developer_email = $1`,
    [req.developer!.email]
  );

  if (!row || !row.is_active) {
    res.json({ connected: false });
    return;
  }

  res.json({
    connected: true,
    ownerId: row.afriapp_owner_id,
    connectedAt: row.connected_at,
    lastVerifiedAt: row.last_verified_at,
  });
});

// DELETE /developer/afriapp-key - disconnect (session auth)
router.delete('/afriapp-key', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const result = await query<{ id: string }>(
    `UPDATE afriapp_connections SET is_active = false
     WHERE developer_email = $1 AND is_active = true
     RETURNING id`,
    [req.developer!.email]
  );

  if (result.length === 0) {
    res.status(404).json({ error: 'not_found', message: 'No active AfriApp connection found' });
    return;
  }

  logger.info('AfriApp key disconnected', { email: req.developer!.email });
  res.json({ disconnected: true });
});

// ─── White-label branding ─────────────────────────────────────────────────────

const whiteLabelSchema = z.object({
  company_name: z.string().min(1).max(100),
  logo_url: z.string().url().max(1000).nullable().optional(),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color e.g. #4F46E5').optional(),
  button_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

// GET /developer/white-label - fetch current developer's branding config
router.get('/white-label', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const row = await queryOne<{
    company_name: string;
    logo_url: string | null;
    primary_color: string;
    button_color: string | null;
    updated_at: string;
  }>(
    `SELECT company_name, logo_url, primary_color, button_color, updated_at
     FROM white_label_configs WHERE developer_email = $1`,
    [req.developer!.email]
  );

  res.json(row ?? {
    company_name: '',
    logo_url: null,
    primary_color: '#4F46E5',
    button_color: null,
  });
});

// PUT /developer/white-label - upsert branding config
router.put(
  '/white-label',
  sessionAuth,
  validateBody(whiteLabelSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { company_name, logo_url, primary_color, button_color } = req.body as z.infer<typeof whiteLabelSchema>;

    await query(
      `INSERT INTO white_label_configs
         (developer_email, company_name, logo_url, primary_color, button_color, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (developer_email) DO UPDATE
         SET company_name   = EXCLUDED.company_name,
             logo_url       = EXCLUDED.logo_url,
             primary_color  = EXCLUDED.primary_color,
             button_color   = EXCLUDED.button_color,
             updated_at     = NOW()`,
      [
        req.developer!.email,
        company_name,
        logo_url ?? null,
        primary_color ?? '#4F46E5',
        button_color ?? null,
      ]
    );

    logger.info('White-label config updated', { email: req.developer!.email });
    res.json({ updated: true });
  }
);

// ─── Provider settings ───────────────────────────────────────────────────────

import {
  routingTableSummary,
  ProviderName
} from '../services/identity-provider.service';

const providerSettingsSchema = z.object({
  api_key_id: z.string().uuid(),
  preferred_provider: z.enum(['smile_identity', 'dojah', 'onfido']).nullable()
});

// GET /developer/provider-settings - returns routing table + per-key preferences
router.get('/provider-settings', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const keys = await query<{ id: string; platform_name: string; preferred_provider: ProviderName | null }>(
    `SELECT id, platform_name, preferred_provider
     FROM api_keys
     WHERE platform_email = $1 AND is_active = true
     ORDER BY created_at DESC`,
    [req.developer!.email]
  );

  res.json({
    routing_table: routingTableSummary(),
    api_keys: keys
  });
});

// PUT /developer/provider-settings - pin a key to a specific provider (or clear it)
router.put(
  '/provider-settings',
  sessionAuth,
  validateBody(providerSettingsSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { api_key_id, preferred_provider } = req.body as z.infer<typeof providerSettingsSchema>;

    // Verify the key belongs to this developer
    const key = await queryOne<{ id: string }>(
      `SELECT id FROM api_keys WHERE id = $1 AND platform_email = $2 AND is_active = true`,
      [api_key_id, req.developer!.email]
    );

    if (!key) {
      res.status(404).json({ error: 'not_found', message: 'API key not found' });
      return;
    }

    await query(
      `UPDATE api_keys SET preferred_provider = $1 WHERE id = $2`,
      [preferred_provider, api_key_id]
    );

    logger.info('Provider preference updated', {
      email: req.developer!.email,
      api_key_id,
      preferred_provider
    });

    res.json({ updated: true, api_key_id, preferred_provider });
  }
);

export default router;
