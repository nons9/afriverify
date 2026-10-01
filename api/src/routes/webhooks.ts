import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query, queryOne } from '../db';
import { resolveCheck, mapOnfidoResultPublic } from '../services/providers/onfido.provider';
import logger from '../utils/logger';

const router = Router();

// ─── POST /webhooks/onfido ───────────────────────────────────────────────────
// Onfido sends a signed POST when a check completes.
// Docs: https://documentation.onfido.com/#webhooks

router.post('/onfido', async (req: Request, res: Response): Promise<void> => {
  // Validate Onfido signature
  const secret = process.env.ONFIDO_WEBHOOK_TOKEN;
  if (secret) {
    const signature = req.headers['x-sha2-signature'] as string | undefined;
    if (!signature) {
      res.status(401).json({ error: 'missing_signature' });
      return;
    }
    const expected = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      res.status(401).json({ error: 'invalid_signature' });
      return;
    }
  }

  const event = req.body as {
    payload?: {
      resource_type?: string;
      action?: string;
      object?: { id?: string; status?: string; href?: string };
    };
  };

  const resourceType = event?.payload?.resource_type;
  const action = event?.payload?.action;
  const checkId = event?.payload?.object?.id;

  // Only process completed checks
  if (resourceType !== 'check' || action !== 'check.completed' || !checkId) {
    res.sendStatus(200);
    return;
  }

  logger.info('Onfido webhook: check completed', { checkId });

  try {
    const { result, sub_result, breakdown } = await resolveCheck(checkId);
    const mapped = mapOnfidoResultPublic(result, sub_result, breakdown);

    // Find identity with this pending check
    const idRow = await queryOne<{ id: string; metadata: Record<string, unknown> }>(
      `SELECT id, metadata FROM verified_identities
       WHERE metadata->>'onfido_check_id' = $1
          OR metadata->>'onfido_biometric_check_id' = $1
       LIMIT 1`,
      [checkId]
    );

    if (!idRow) {
      logger.warn('Onfido webhook: no identity found for check', { checkId });
      res.sendStatus(200);
      return;
    }

    const isBiometric = idRow.metadata?.onfido_biometric_check_id === checkId;

    if (mapped.success) {
      const newLevel = isBiometric ? 2 : Math.max(1, 0);
      await query(
        `UPDATE verified_identities
         SET verification_level = GREATEST(verification_level, $1),
             trust_score        = GREATEST(trust_score, $2),
             trust_level        = CASE WHEN $1 >= 2 THEN 'rising' ELSE trust_level END,
             metadata           = metadata || $3::jsonb,
             updated_at         = NOW()
         WHERE id = $4`,
        [
          newLevel,
          isBiometric ? 700 : 500,
          JSON.stringify({
            onfido_check_id: undefined,
            onfido_check_pending: false,
            onfido_biometric_check_id: undefined,
            onfido_biometric_pending: false,
            onfido_result: result,
            onfido_sub_result: sub_result
          }),
          idRow.id
        ]
      );
      logger.info('Onfido webhook: identity upgraded', { identityId: idRow.id, level: newLevel, result });
    } else {
      // Clear pending flags, record failure
      await query(
        `UPDATE verified_identities
         SET metadata  = metadata || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2`,
        [
          JSON.stringify({
            onfido_check_id: undefined,
            onfido_check_pending: false,
            onfido_biometric_check_id: undefined,
            onfido_biometric_pending: false,
            onfido_result: result,
            onfido_sub_result: sub_result
          }),
          idRow.id
        ]
      );
      logger.info('Onfido webhook: check failed', { identityId: idRow.id, result, sub_result });
    }
  } catch (err) {
    logger.error('Onfido webhook processing error', { checkId, error: (err as Error).message });
    // Return 200 so Onfido doesn't retry; the failure is logged for investigation.
  }

  res.sendStatus(200);
});

export default router;
