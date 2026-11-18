/** Public, unauthenticated, cacheable facts: GET /v1/plans (what we charge) and GET /v1/status (how we are doing). */
import { Router, Request, Response } from 'express';
import { getPublicPlans } from '../services/billing.service';
import { getPublicStatus } from '../services/status.service';

const router = Router();

function open(res: Response, seconds: number): void {
  res.setHeader('Access-Control-Allow-Origin', '*');           // public, read-only
  res.setHeader('Cache-Control', `public, max-age=${seconds}`);
}

router.get('/plans', (_req: Request, res: Response): void => {
  open(res, 300);
  res.json(getPublicPlans());
});

router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  open(res, 30);
  res.json(await getPublicStatus());
});

export default router;
