import { Router, Request, Response } from 'express';
import { randomBytes, createHmac } from 'crypto';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { sessionAuth } from '../middleware/sessionAuth';
import { validateBody } from '../middleware/validate';
import { query, queryOne } from '../db';
import { generateApiKey, encryptString, getDataEncryptionKey } from '../utils/crypto';
import logger from '../utils/logger';

const router = Router();

const createKeySchema = z.object({
  platform_name: z.string().min(2).max(100),
  platform_email: z.string().email(),
  environment: z.enum(['sandbox', 'production']).default('sandbox')
});

// POST /developer/keys — public bootstrap (no auth required)
router.post(
  '/keys',
  validateBody(createKeySchema),
  async (req: Request, res: Response): Promise<void> => {
    const { platform_name, platform_email, environment } =
      req.body as z.infer<typeof createKeySchema>;

    const { key, hash, prefix } = generateApiKey(environment);

    const rows = await query<{ id: string }>(
      `INSERT INTO api_keys
         (platform_name, platform_email, api_key_hash, api_key_prefix, environment,
          tier, monthly_limit)
       VALUES ($1,$2,$3,$4,$5,'free',100)
       RETURNING id`,
      [platform_name, platform_email, hash, prefix, environment]
    );

    logger.info('New API key created', { platform: platform_name, environment, id: rows[0].id });

    res.status(201).json({
      api_key: key,
      prefix,
      environment,
      tier: 'free',
      monthly_limit: 100,
      message: 'Store this API key securely. It will NOT be shown again.',
      id: rows[0].id
    });
  }
);

// GET /developer/keys — list all keys for the signed-in developer (session auth)
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
  }>(
    `SELECT id, platform_name, api_key_prefix, environment, tier, monthly_limit,
            verifications_this_month, last_used, is_active, created_at,
            webhook_url
     FROM api_keys WHERE platform_email = $1 ORDER BY created_at DESC`,
    [req.developer!.email]
  );

  res.json({ keys });
});

// DELETE /developer/keys/:id — revoke a key (session auth)
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

// GET /developer/overview — dashboard summary (session auth)
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
      `SELECT ve.type, ve.created_at
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

// GET /developer/usage — per-key usage stats (API key auth)
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

// GET /developer/usage/daily — last-7-days per-day breakdown (session auth)
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

// PATCH /developer/keys/:id/webhook — set or clear webhook URL (session auth)
router.patch('/keys/:id/webhook', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { webhook_url } = req.body as { webhook_url: string | null };

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

// POST /developer/keys/:id/webhook/secret — regenerate signing secret (session auth)
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
  // Return the raw secret once — it will not be shown again
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

export default router;
