/**
 * Internal API — authenticated with API key, not exposed publicly.
 * Used by EMERGE GROUP services (ScoutAfrika, OrbitVerse, SANKOFA)
 * to check identity status for their own users.
 *
 * Base path: /v1/internal
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { rateLimitApiKey } from '../middleware/rateLimit';
import { writeAuditEvent } from '../middleware/audit';
import { query, queryOne } from '../db';
import logger from '../utils/logger';

const router = Router();

router.use(authenticate);
router.use(rateLimitApiKey);

/**
 * GET /v1/internal/users/:platformUserId/status
 *
 * Returns the verification status of a platform user.
 * Looks up the platform_connections table using the calling API key's platform_name
 * and the provided platform_user_id.
 *
 * This is what ScoutAfrika's orbitverify.service.ts polls.
 */
router.get('/users/:platformUserId/status', async (req: Request, res: Response): Promise<void> => {
  const { platformUserId } = req.params;
  const apiKey = req.apiKey!;

  try {
    const row = await queryOne<{
      verification_level: number;
      trust_score: number;
      trust_level: string;
      aml_status: string;
      is_blacklisted: boolean;
      identity_id: string;
      last_verified: string | null;
    }>(
      `SELECT vi.verification_level, vi.trust_score, vi.trust_level,
              vi.aml_status, vi.is_blacklisted, vi.id AS identity_id,
              pc.last_verified
       FROM platform_connections pc
       JOIN verified_identities vi ON vi.id = pc.identity_id
       WHERE pc.platform_name = $1
         AND pc.platform_user_id = $2
         AND pc.is_active = true`,
      [apiKey.platform_name, platformUserId]
    );

    if (!row) {
      // User has not started verification via this platform yet
      res.json({
        verified: false,
        level: 'none',
        verification_level: 0,
        identity_id: null,
        message: 'No identity record linked to this platform user.',
      });
      return;
    }

    const levelLabel = row.verification_level >= 2
      ? 'biometric'
      : row.verification_level >= 1
        ? 'basic'
        : 'none';

    await writeAuditEvent(req, {
      event_type: 'status_check',
      identity_id: row.identity_id,
      result: 'passed',
      metadata: { platform_user_id: platformUserId, level: row.verification_level },
    });

    res.json({
      verified: row.verification_level >= 1,
      level: levelLabel,
      verification_level: row.verification_level,
      identity_id: row.identity_id,
      trust_score: row.trust_score,
      trust_level: row.trust_level,
      aml_status: row.aml_status,
      is_blacklisted: row.is_blacklisted,
      last_verified: row.last_verified,
    });
  } catch (err) {
    logger.error('Internal status check error', { error: (err as Error).message, platformUserId });
    res.status(500).json({ error: 'internal_error', message: 'Status check failed' });
  }
});

/**
 * GET /v1/internal/users/:platformUserId/vit
 *
 * Issues a fresh VIT for a platform user.
 * Used when a platform needs to re-verify the user's identity token.
 */
router.get('/users/:platformUserId/vit', async (req: Request, res: Response): Promise<void> => {
  const { platformUserId } = req.params;
  const apiKey = req.apiKey!;

  try {
    const row = await queryOne<{ identity_id: string }>(
      `SELECT vi.id AS identity_id
       FROM platform_connections pc
       JOIN verified_identities vi ON vi.id = pc.identity_id
       WHERE pc.platform_name = $1 AND pc.platform_user_id = $2 AND pc.is_active = true`,
      [apiKey.platform_name, platformUserId]
    );

    if (!row) {
      res.status(404).json({ error: 'not_found', message: 'No identity linked to this platform user' });
      return;
    }

    const { issueVIT } = await import('../services/vit.service');
    const { token, payload } = await issueVIT(row.identity_id);

    await writeAuditEvent(req, {
      event_type: 'vit_issued',
      identity_id: row.identity_id,
      result: 'passed',
      metadata: { platform_user_id: platformUserId, requested_by: apiKey.platform_name },
    });

    res.json({ token, payload });
  } catch (err) {
    logger.error('VIT issue error', { error: (err as Error).message, platformUserId });
    res.status(500).json({ error: 'internal_error', message: 'VIT issuance failed' });
  }
});

/**
 * POST /v1/internal/users/:platformUserId/link
 *
 * Manually links a platform user to an existing identity by phone number.
 * Used when a platform already has the user's phone and wants to pre-link
 * before the user starts the verification flow.
 */
router.post('/users/:platformUserId/link', async (req: Request, res: Response): Promise<void> => {
  const { platformUserId } = req.params;
  const { phone } = req.body as { phone?: string };
  const apiKey = req.apiKey!;

  if (!phone) {
    res.status(400).json({ error: 'validation_error', message: 'phone is required' });
    return;
  }

  try {
    const identity = await queryOne<{ id: string; verification_level: number }>(
      `SELECT id, verification_level FROM verified_identities WHERE phone = $1`,
      [phone]
    );

    if (!identity) {
      // No identity yet — create a stub so the connection exists when they verify
      const { rows } = await query<{ id: string }>(
        `INSERT INTO verified_identities (phone) VALUES ($1)
         ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
         RETURNING id`,
        [phone]
      );
      const identityId = rows[0].id;

      await query(
        `INSERT INTO platform_connections
           (identity_id, platform_name, platform_api_key_id, platform_user_id)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (identity_id, platform_name) DO UPDATE SET
           platform_user_id = EXCLUDED.platform_user_id, is_active = true`,
        [identityId, apiKey.platform_name, apiKey.id, platformUserId]
      );

      res.json({ linked: true, identity_id: identityId, verification_level: 0, is_new: true });
      return;
    }

    await query(
      `INSERT INTO platform_connections
         (identity_id, platform_name, platform_api_key_id, platform_user_id, last_verified)
       VALUES ($1,$2,$3,$4,CASE WHEN $5 >= 1 THEN NOW() ELSE NULL END)
       ON CONFLICT (identity_id, platform_name) DO UPDATE SET
         platform_user_id = EXCLUDED.platform_user_id,
         platform_api_key_id = EXCLUDED.platform_api_key_id,
         last_verified = EXCLUDED.last_verified,
         is_active = true`,
      [identity.id, apiKey.platform_name, apiKey.id, platformUserId, identity.verification_level]
    );

    await writeAuditEvent(req, {
      event_type: 'platform_connection',
      identity_id: identity.id,
      result: 'passed',
      metadata: { platform_user_id: platformUserId, platform: apiKey.platform_name },
    });

    res.json({
      linked: true,
      identity_id: identity.id,
      verification_level: identity.verification_level,
      is_new: false,
    });
  } catch (err) {
    logger.error('Link platform user error', { error: (err as Error).message });
    res.status(500).json({ error: 'internal_error', message: 'Link failed' });
  }
});

export default router;
