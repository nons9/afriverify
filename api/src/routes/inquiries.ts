import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { sessionAuth } from '../middleware/sessionAuth';
import { validateBody } from '../middleware/validate';
import { query, queryOne } from '../db';
import logger from '../utils/logger';

const router = Router();

const createInquirySchema = z.object({
  api_key_id: z.string().uuid(),
  label: z.string().min(2).max(255),
  description: z.string().max(1000).optional(),
  allowed_id_types: z.array(z.string()).default([]),
  require_liveness: z.boolean().default(false),
  redirect_url: z.string().url().max(2048).optional(),
  webhook_url: z.string().url().max(2048).optional(),
  max_uses: z.number().int().min(1).optional(),
  expires_at: z.string().datetime().optional(),
});

// POST /v1/inquiries — create a new inquiry link (session auth)
router.post('/', sessionAuth, validateBody(createInquirySchema), async (req: Request, res: Response): Promise<void> => {
  const {
    api_key_id, label, description, allowed_id_types,
    require_liveness, redirect_url, webhook_url, max_uses, expires_at,
  } = req.body as z.infer<typeof createInquirySchema>;

  const keyRow = await queryOne<{ id: string; environment: string }>(
    'SELECT id, environment FROM api_keys WHERE id = $1 AND platform_email = $2 AND is_active = true',
    [api_key_id, req.developer!.email]
  );
  if (!keyRow) {
    res.status(404).json({ error: 'not_found', message: 'API key not found or inactive' });
    return;
  }

  // URL-safe 12-char slug
  const slug = randomBytes(9).toString('base64url');

  const rows = await query<{ id: string; slug: string; created_at: string }>(
    `INSERT INTO inquiry_links
       (slug, api_key_id, developer_email, label, description, allowed_id_types,
        require_liveness, redirect_url, webhook_url, max_uses, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, slug, created_at`,
    [
      slug, api_key_id, req.developer!.email, label, description ?? null,
      allowed_id_types, require_liveness, redirect_url ?? null,
      webhook_url ?? null, max_uses ?? null, expires_at ?? null,
    ]
  );

  logger.info('Inquiry link created', { id: rows[0].id, slug: rows[0].slug });

  res.status(201).json({
    id: rows[0].id,
    slug: rows[0].slug,
    label,
    status: 'active',
    created_at: rows[0].created_at,
    inquiry_url: `/verify/inquiry/${rows[0].slug}`,
  });
});

// GET /v1/inquiries — list all inquiries for the developer (session auth)
router.get('/', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const rows = await query<{
    id: string;
    slug: string;
    label: string;
    description: string | null;
    status: string;
    current_uses: number;
    max_uses: number | null;
    require_liveness: boolean;
    allowed_id_types: string[];
    expires_at: string | null;
    created_at: string;
    submission_count: number;
    completed_count: number;
  }>(
    `SELECT il.id, il.slug, il.label, il.description, il.status::text,
            il.current_uses, il.max_uses, il.require_liveness, il.allowed_id_types,
            il.expires_at, il.created_at,
            COUNT(s.id)::int AS submission_count,
            COUNT(s.id) FILTER (WHERE s.result = 'passed')::int AS completed_count
     FROM inquiry_links il
     LEFT JOIN inquiry_submissions s ON s.inquiry_id = il.id
     WHERE il.developer_email = $1
     GROUP BY il.id
     ORDER BY il.created_at DESC`,
    [req.developer!.email]
  );

  res.json({ inquiries: rows });
});

// GET /v1/inquiries/:id — get single inquiry with submissions (session auth)
router.get('/:id', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const row = await queryOne<{
    id: string; slug: string; label: string; description: string | null;
    allowed_id_types: string[]; require_liveness: boolean; redirect_url: string | null;
    webhook_url: string | null; status: string; max_uses: number | null;
    current_uses: number; expires_at: string | null; created_at: string;
  }>(
    `SELECT id, slug, label, description, allowed_id_types, require_liveness,
            redirect_url, webhook_url, status::text, max_uses, current_uses,
            expires_at, created_at
     FROM inquiry_links WHERE id = $1 AND developer_email = $2`,
    [id, req.developer!.email]
  );

  if (!row) {
    res.status(404).json({ error: 'not_found', message: 'Inquiry not found' });
    return;
  }

  const submissions = await query<{
    id: string; result: string; completed_at: string | null; created_at: string;
  }>(
    `SELECT id, result, completed_at, created_at
     FROM inquiry_submissions WHERE inquiry_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [id]
  );

  res.json({ ...row, submissions });
});

// PATCH /v1/inquiries/:id — update label / status (session auth)
const updateInquirySchema = z.object({
  label: z.string().min(2).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  status: z.enum(['active', 'revoked']).optional(),
  max_uses: z.number().int().min(1).nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
});

router.patch('/:id', sessionAuth, validateBody(updateInquirySchema), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const updates = req.body as z.infer<typeof updateInquirySchema>;

  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM inquiry_links WHERE id = $1 AND developer_email = $2',
    [id, req.developer!.email]
  );
  if (!existing) {
    res.status(404).json({ error: 'not_found', message: 'Inquiry not found' });
    return;
  }

  const setParts: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  if (updates.label !== undefined)       { setParts.push(`label = $${idx++}`);       vals.push(updates.label); }
  if (updates.description !== undefined) { setParts.push(`description = $${idx++}`); vals.push(updates.description); }
  if (updates.status !== undefined)      { setParts.push(`status = $${idx++}`);      vals.push(updates.status); }
  if (updates.max_uses !== undefined)    { setParts.push(`max_uses = $${idx++}`);    vals.push(updates.max_uses); }
  if (updates.expires_at !== undefined)  { setParts.push(`expires_at = $${idx++}`); vals.push(updates.expires_at); }

  if (setParts.length === 0) {
    res.status(400).json({ error: 'no_changes', message: 'No fields to update' });
    return;
  }

  vals.push(id);
  await query(`UPDATE inquiry_links SET ${setParts.join(', ')} WHERE id = $${idx}`, vals);

  logger.info('Inquiry updated', { id, updates });
  res.json({ success: true });
});

// DELETE /v1/inquiries/:id — revoke (session auth)
router.delete('/:id', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const result = await query<{ id: string }>(
    `UPDATE inquiry_links SET status = 'revoked'
     WHERE id = $1 AND developer_email = $2 AND status = 'active'
     RETURNING id`,
    [id, req.developer!.email]
  );

  if (result.length === 0) {
    res.status(404).json({ error: 'not_found', message: 'Inquiry not found or already revoked' });
    return;
  }

  logger.info('Inquiry revoked', { id });
  res.json({ success: true });
});

export default router;
