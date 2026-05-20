import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';
import { rateLimitApiKey } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';
import { applyTrustEvent, getTrustHistory, trustLevelFromScore } from '../services/trust-score.service';
import { queryOne } from '../db';
import { VerifiedIdentity } from '../types';

const router = Router();
router.use(authenticate);
router.use(rateLimitApiKey);

const TRUST_DELTAS: Record<string, number> = {
  initial_verification:      100,
  first_platform_connection:  50,
  transaction_completed:      15,
  positive_review:            10,
  dispute_resolved_favour:     5,
  commitment_met:              5,
  dispute_lost:              -30,
  payment_failed:            -20,
  negative_review:           -10,
  broken_commitment:          -8,
  flagged_confirmed:         -25,
  off_platform_contact:      -15,
  platform_ban:             -200,
  fraud_confirmed:          -9999
};

// ─── GET /trust/:identity_id ──────────────────────────────────────────────────
router.get(
  '/:identity_id',
  requirePermission('trust'),
  async (req: Request, res: Response): Promise<void> => {
    const { identity_id } = req.params;

    const identity = await queryOne<Pick<VerifiedIdentity, 'trust_score' | 'trust_level'>>(
      'SELECT trust_score, trust_level FROM verified_identities WHERE id = $1',
      [identity_id]
    );
    if (!identity) {
      res.status(404).json({ error: 'identity_not_found', message: 'Identity not found' });
      return;
    }

    const history = await getTrustHistory(identity_id);

    res.json({
      identity_id,
      trust_score: identity.trust_score,
      trust_level: identity.trust_level,
      history
    });
  }
);

// ─── POST /trust/update ───────────────────────────────────────────────────────
const updateSchema = z.object({
  identity_id: z.string().uuid(),
  event_type: z.string().min(1).max(100),
  reference_id: z.string().uuid().optional(),
  notes: z.string().max(500).optional()
});

router.post(
  '/update',
  requirePermission('trust'),
  validateBody(updateSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { identity_id, event_type, reference_id, notes } =
      req.body as z.infer<typeof updateSchema>;

    const delta = TRUST_DELTAS[event_type];
    if (delta === undefined) {
      res.status(400).json({
        error: 'unknown_event_type',
        message: `Unknown event type: ${event_type}`,
        valid_types: Object.keys(TRUST_DELTAS)
      });
      return;
    }

    const result = await applyTrustEvent({
      identity_id,
      event_type,
      platform: req.platform,
      score_delta: delta,
      reference_id,
      notes
    });

    res.json(result);
  }
);

export default router;
