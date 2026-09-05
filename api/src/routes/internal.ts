/**
 * Internal API — authenticated with API key, not exposed publicly.
 * Used by EMERGE GROUP services (ScoutAfrika, OrbitVerse, SANKOFA)
 * to check identity status for their own users.
 *
 * Base path: /v1/internal
 */
import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { rateLimitApiKey } from '../middleware/rateLimit';
import { writeAuditEvent } from '../middleware/audit';
import { query, queryOne } from '../db';
import { deleteFromS3 } from '../utils/s3';
import logger from '../utils/logger';
import { recordFraudSignal } from '../services/orbitshield/fraud-graph.service';

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
 * This is what a connected platform's own AfriVerify client service polls.
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
      const rows = await query<{ id: string }>(
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
      event_type: 'platform_connected',
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

/**
 * DELETE /v1/internal/users/:platformUserId
 *
 * Right-to-erasure request (NDPA/GDPR): a platform asks AfriVerify to
 * delete a user's identifying data. Deletes their stored ID photo/selfie
 * from the bucket and scrubs identifying fields on verified_identities.
 *
 * Fraud-prevention fields (is_blacklisted, blacklist_reason, aml_status,
 * trust_score) are kept: both NDPA and GDPR recognize fraud prevention as
 * a legitimate basis to retain a minimal record even after an erasure
 * request, so this does not let someone erase their way out of a
 * blacklist and re-register.
 */
router.delete('/users/:platformUserId', async (req: Request, res: Response): Promise<void> => {
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

    const sessions = await query<{ id_photo_s3_key: string | null; face_photo_s3_key: string | null }>(
      `SELECT id_photo_s3_key, face_photo_s3_key FROM verification_sessions WHERE identity_id = $1`,
      [row.identity_id]
    );

    for (const session of sessions) {
      for (const key of [session.id_photo_s3_key, session.face_photo_s3_key]) {
        if (!key) continue;
        try {
          await deleteFromS3(key);
        } catch (err) {
          logger.error('Erasure: failed to delete stored media', { key, error: (err as Error).message });
        }
      }
    }

    await query(
      `UPDATE verification_sessions SET id_photo_s3_key = NULL, face_photo_s3_key = NULL WHERE identity_id = $1`,
      [row.identity_id]
    );

    await query(
      `UPDATE verified_identities
       SET phone = $1, full_name = '', nationality = '', id_number_hash = '',
           face_embedding = NULL, voice_print = NULL, device_fingerprints = '[]',
           metadata = '{}', updated_at = NOW()
       WHERE id = $2`,
      [`erased:${randomUUID()}`, row.identity_id]
    );

    await writeAuditEvent(req, {
      event_type: 'data_erased',
      identity_id: row.identity_id,
      result: 'passed',
      metadata: { platform_user_id: platformUserId, requested_by: apiKey.platform_name },
    });

    logger.info('Identity data erased on request', {
      identity_id: row.identity_id,
      requested_by: apiKey.platform_name,
    });

    res.json({ erased: true, identity_id: row.identity_id });
  } catch (err) {
    logger.error('Erasure request failed', { error: (err as Error).message, platformUserId });
    res.status(500).json({ error: 'internal_error', message: 'Erasure request failed' });
  }
});

/**
 * POST /v1/internal/fraud-signal
 *
 * Receives a fraud event from a connected platform (e.g. Kliqa detects a
 * blacklisted VIT at the withdrawal gate) and feeds it into OrbitShield's
 * fraud graph so the identity's risk score is updated across all platforms.
 *
 * Body: { platformUserId, fraudType, ipAddress?, deviceId? }
 * fraudType examples: "vit_gate_blocked", "aml_flagged", "account_takeover"
 */
router.post('/fraud-signal', async (req: Request, res: Response): Promise<void> => {
  const { platformUserId, fraudType, ipAddress, deviceId } = req.body as {
    platformUserId?: string;
    fraudType?: string;
    ipAddress?: string;
    deviceId?: string;
  };
  const apiKey = req.apiKey!;

  if (!platformUserId || typeof platformUserId !== 'string') {
    res.status(400).json({ error: 'validation_error', message: 'platformUserId is required' });
    return;
  }
  if (!fraudType || typeof fraudType !== 'string') {
    res.status(400).json({ error: 'validation_error', message: 'fraudType is required' });
    return;
  }

  try {
    const row = await queryOne<{ identity_id: string }>(
      `SELECT vi.id AS identity_id
       FROM platform_connections pc
       JOIN verified_identities vi ON vi.id = pc.identity_id
       WHERE pc.platform_name = $1 AND pc.platform_user_id = $2 AND pc.is_active = true`,
      [apiKey.platform_name, platformUserId]
    );

    if (!row) {
      // No linked identity yet — signal is noted but cannot be attributed
      res.json({ recorded: false, reason: 'no_identity_linked' });
      return;
    }

    await recordFraudSignal({
      identityId: row.identity_id,
      fraudType,
      reportingPlatform: apiKey.platform_name,
      ...(ipAddress ? { ipAddress } : {}),
      ...(deviceId  ? { deviceId  } : {}),
    });

    await writeAuditEvent(req, {
      event_type: 'fraud_signal',
      identity_id: row.identity_id,
      result: 'passed',
      metadata: { platform_user_id: platformUserId, fraud_type: fraudType },
    });

    logger.warn('Fraud signal recorded', {
      identityId: row.identity_id,
      fraudType,
      reportingPlatform: apiKey.platform_name,
    });

    res.json({ recorded: true, identity_id: row.identity_id });
  } catch (err) {
    logger.error('Fraud signal error', { error: (err as Error).message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to record fraud signal' });
  }
});

export default router;
