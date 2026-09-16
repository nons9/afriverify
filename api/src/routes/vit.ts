import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';
import { rateLimitApiKey } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';
import { writeAuditEvent } from '../middleware/audit';
import { verifyAndLogVIT } from '../services/vit.service';
import { queryOne } from '../db';
import logger from '../utils/logger';

const router = Router();

router.use(authenticate);
router.use(rateLimitApiKey);
router.use(requirePermission('verify'));

// ─── POST /vit/verify ─────────────────────────────────────────────────────────
// Accepts a VIT JWT presented by a user, validates signature + revocation,
// and returns sanitized identity claims. The developer never sees PII (name,
// raw ID number, DOB) — only verification signals and aggregate scores.
const verifySchema = z.object({
  token: z.string().min(50).max(4096)
});

router.post('/verify', validateBody(verifySchema), async (req: Request, res: Response): Promise<void> => {
  const { token } = req.body as z.infer<typeof verifySchema>;
  const apiKeyId = req.apiKey!.id;

  const keyInfo = await queryOne<{ platform_name: string }>(
    `SELECT platform_name FROM api_keys WHERE id = $1`,
    [apiKeyId]
  );
  const platformName = keyInfo?.platform_name ?? 'unknown';

  logger.info('VIT verify requested', { apiKeyId, platformName });

  const result = await verifyAndLogVIT(token, apiKeyId, platformName);

  if (!result.valid) {
    const status = result.error === 'token_expired' ? 410 : 400;
    res.status(status).json({ valid: false, error: result.error });
    return;
  }

  await writeAuditEvent(req, {
    event_type: 'vit_verified',
    result: 'passed',
    metadata: { platform_name: platformName, identity_id: result.claims?.identity_id }
  });

  res.json({ valid: true, claims: result.claims });
});

export default router;
