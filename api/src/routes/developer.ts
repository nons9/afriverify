import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { query, queryOne } from '../db';
import { generateApiKey, sha256 } from '../utils/crypto';
import logger from '../utils/logger';

const router = Router();

// POST /developer/keys — does NOT require existing auth (bootstrap endpoint)
const createKeySchema = z.object({
  platform_name: z.string().min(2).max(100),
  platform_email: z.string().email(),
  environment: z.enum(['sandbox', 'production']).default('sandbox')
});

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

    // Key is shown ONCE — it is never retrievable again
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

// GET /developer/usage — requires auth
router.get(
  '/usage',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const apiKey = req.apiKey!;

    const today = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM verification_events
       WHERE api_key_id = $1 AND created_at >= CURRENT_DATE`,
      [apiKey.id]
    );
    const thisMonth = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM verification_events
       WHERE api_key_id = $1
         AND created_at >= DATE_TRUNC('month', NOW())`,
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
  }
);

export default router;
