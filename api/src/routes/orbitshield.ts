import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';
import { rateLimitApiKey } from '../middleware/rateLimit';
import { validateQuery } from '../middleware/validate';
import { getContinuityHistory } from '../services/orbitshield/live-ledger.service';
import { evaluateNetworkRisk } from '../services/orbitshield/fraud-graph.service';
import { getVouchStatus } from '../services/orbitshield/community-vouch.service';
import { getDeepScanHistory } from '../services/orbitshield/deepscan.service';
import { queryOne } from '../db';

const router = Router();
router.use(authenticate);
router.use(rateLimitApiKey);

const identityParam = z.object({ identity_id: z.string().uuid() });
const limitQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });

// ─── GET /orbitshield/continuity/:identity_id ────────────────────────────────────────────────────────────────────
router.get(
  '/continuity/:identity_id',
  requirePermission('check'),
  validateQuery(limitQuery),
  async (req: Request, res: Response): Promise<void> => {
    const parse = identityParam.safeParse(req.params);
    if (!parse.success) {
      res.status(400).json({ error: 'invalid_identity_id' });
      return;
    }
    const { identity_id } = parse.data;
    const { limit } = req.query as unknown as { limit: number };

    const exists = await queryOne<{ id: string }>(
      'SELECT id FROM verified_identities WHERE id = $1',
      [identity_id]
    );
    if (!exists) {
      res.status(404).json({ error: 'identity_not_found' });
      return;
    }

    const history = await getContinuityHistory(identity_id, limit);
    res.json({ identity_id, count: history.length, history });
  }
);

// ─── GET /orbitshield/fraud-graph/:identity_id ─────────────────────────────────────────────────────────────────────
router.get(
  '/fraud-graph/:identity_id',
  requirePermission('check'),
  async (req: Request, res: Response): Promise<void> => {
    const parse = identityParam.safeParse(req.params);
    if (!parse.success) {
      res.status(400).json({ error: 'invalid_identity_id' });
      return;
    }
    const { identity_id } = parse.data;

    const exists = await queryOne<{ id: string }>(
      'SELECT id FROM verified_identities WHERE id = $1',
      [identity_id]
    );
    if (!exists) {
      res.status(404).json({ error: 'identity_not_found' });
      return;
    }

    const result = await evaluateNetworkRisk(
      identity_id,
      (req.headers['x-device-id'] as string) ?? undefined,
      req.ip ?? undefined
    );
    res.json({ identity_id, ...result });
  }
);

// ─── GET /orbitshield/vouch/:identity_id ───────────────────────────────────────────────────────────────────────────
router.get(
  '/vouch/:identity_id',
  requirePermission('check'),
  async (req: Request, res: Response): Promise<void> => {
    const parse = identityParam.safeParse(req.params);
    if (!parse.success) {
      res.status(400).json({ error: 'invalid_identity_id' });
      return;
    }
    const { identity_id } = parse.data;

    const exists = await queryOne<{ id: string }>(
      'SELECT id FROM verified_identities WHERE id = $1',
      [identity_id]
    );
    if (!exists) {
      res.status(404).json({ error: 'identity_not_found' });
      return;
    }

    const status = await getVouchStatus(identity_id);
    res.json({ identity_id, ...status });
  }
);

// ─── GET /orbitshield/deepscan/:identity_id ──────────────────────────────────────────────────────────────────────
router.get(
  '/deepscan/:identity_id',
  requirePermission('check'),
  validateQuery(limitQuery),
  async (req: Request, res: Response): Promise<void> => {
    const parse = identityParam.safeParse(req.params);
    if (!parse.success) {
      res.status(400).json({ error: 'invalid_identity_id' });
      return;
    }
    const { identity_id } = parse.data;
    const { limit } = req.query as unknown as { limit: number };

    const exists = await queryOne<{ id: string }>(
      'SELECT id FROM verified_identities WHERE id = $1',
      [identity_id]
    );
    if (!exists) {
      res.status(404).json({ error: 'identity_not_found' });
      return;
    }

    const history = await getDeepScanHistory(identity_id, limit);
    res.json({ identity_id, count: history.length, scans: history });
  }
);

export default router;
