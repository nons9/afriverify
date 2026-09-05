import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';
import { identityAuth } from '../middleware/identityAuth';
import { writeAuditEvent } from '../middleware/audit';
import { requestPortalLogin, confirmPortalLogin } from '../services/identity-portal.service';
import { pushConnectionRevoked } from '../services/platform-webhook.service';
import { query, queryOne } from '../db';
import logger from '../utils/logger';

const router = Router();

const phoneSchema = z.object({
  phone: z.string().min(7).max(20).regex(/^\+?[1-9]\d{6,19}$/, 'Invalid phone number')
});

// ─── POST /identity-portal/login/otp/send ─────────────────────────────────────────────────────────
router.post('/login/otp/send', validateBody(phoneSchema), async (req: Request, res: Response): Promise<void> => {
  const { phone } = req.body as z.infer<typeof phoneSchema>;
  try {
    await requestPortalLogin(phone);
  } catch (err) {
    logger.error('Identity portal OTP send failed', { error: (err as Error).message });
  }
  // Always the same response, whether or not the phone is a registered identity
  res.json({ sent: true });
});

// ─── POST /identity-portal/login/otp/confirm ──────────────────────────────────────────────────────
const confirmSchema = phoneSchema.extend({
  otp: z.string().length(6)
});

router.post('/login/otp/confirm', validateBody(confirmSchema), async (req: Request, res: Response): Promise<void> => {
  const { phone, otp } = req.body as z.infer<typeof confirmSchema>;
  const result = await confirmPortalLogin(phone, otp);

  if (!result.ok) {
    const status = result.error === 'too_many_attempts' ? 429 : 401;
    res.status(status).json({ error: result.error, message: portalLoginErrorMessage(result.error) });
    return;
  }

  await writeAuditEvent(req, {
    event_type: 'identity_portal_login',
    identity_id: result.identityId,
    result: 'passed'
  });

  res.json({ token: result.token });
});

function portalLoginErrorMessage(error: string): string {
  switch (error) {
    case 'otp_expired':
      return 'Code expired. Request a new one.';
    case 'too_many_attempts':
      return 'Too many incorrect attempts. Request a new code.';
    case 'invalid_otp':
      return 'Incorrect code.';
    default:
      return 'Could not verify code.';
  }
}

// ─── GET /identity-portal/me ────────────────────────────────────────────────────────────────────────
router.get('/me', identityAuth, async (req: Request, res: Response): Promise<void> => {
  const identity = await queryOne<{
    full_name: string;
    nationality: string;
    verification_level: number;
    trust_score: number;
    trust_level: string;
    verified_at: string | null;
  }>(
    `SELECT full_name, nationality, verification_level, trust_score, trust_level, verified_at
     FROM verified_identities WHERE id = $1`,
    [req.identity!.identityId]
  );

  if (!identity) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  res.json({ phone: req.identity!.phone, ...identity });
});

// ─── GET /identity-portal/connections ───────────────────────────────────────────────────────────────
router.get('/connections', identityAuth, async (req: Request, res: Response): Promise<void> => {
  const connections = await query<{
    platform_name: string;
    connected_at: string;
    last_verified: string | null;
    is_active: boolean;
  }>(
    `SELECT platform_name, connected_at, last_verified, is_active
     FROM platform_connections WHERE identity_id = $1 ORDER BY connected_at DESC`,
    [req.identity!.identityId]
  );

  res.json({ connections });
});

// ─── POST /identity-portal/connections/:platform_name/revoke ─────────────────────────────────────────
router.post('/connections/:platform_name/revoke', identityAuth, async (req: Request, res: Response): Promise<void> => {
  const platformName = req.params.platform_name as string;

  const connection = await queryOne<{ id: string; platform_api_key_id: string | null; platform_user_id: string | null }>(
    `UPDATE platform_connections SET is_active = false
     WHERE identity_id = $1 AND platform_name = $2 AND is_active = true
     RETURNING id, platform_api_key_id, platform_user_id`,
    [req.identity!.identityId, platformName]
  );

  if (!connection) {
    res.status(404).json({ error: 'not_found', message: 'No active connection to that platform' });
    return;
  }

  await writeAuditEvent(req, {
    event_type: 'connection_revoked',
    identity_id: req.identity!.identityId,
    result: 'passed',
    metadata: { platform_name: platformName }
  });

  if (connection.platform_api_key_id) {
    await pushConnectionRevoked(connection.platform_api_key_id, req.identity!.identityId, connection.platform_user_id);
  }

  res.json({ success: true });
});

export default router;
