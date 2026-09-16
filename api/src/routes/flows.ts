import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sessionAuth } from '../middleware/sessionAuth';
import { validateBody } from '../middleware/validate';
import { query, queryOne } from '../db';

const router = Router();

const VALID_STEPS = ['phone', 'otp', 'id_upload', 'face_scan', 'kyb'] as const;
const VALID_ID_TYPES = ['national_id', 'passport', 'drivers_license', 'voter_id', 'residence_permit'] as const;

const flowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  required_steps: z.array(z.enum(VALID_STEPS)).default(['phone', 'otp']),
  optional_steps: z.array(z.enum(VALID_STEPS)).default(['id_upload', 'face_scan']),
  allowed_id_types: z.array(z.enum(VALID_ID_TYPES)).default(['national_id', 'passport', 'drivers_license']),
  allowed_countries: z.array(z.string().length(2).toUpperCase()).nullable().default(null),
  min_verification_level: z.number().int().min(0).max(2).default(1),
  success_url: z.string().url().optional().nullable(),
  failure_url: z.string().url().optional().nullable(),
  brand_name: z.string().max(100).optional().nullable(),
  brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  welcome_message: z.string().max(500).optional().nullable(),
});

router.use(sessionAuth);

// ─── GET /developer/flows ────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const flows = await query(
    `SELECT id, name, description, required_steps, optional_steps, allowed_id_types,
            allowed_countries, min_verification_level, success_url, failure_url,
            brand_name, brand_color, welcome_message, is_active, created_at, updated_at
     FROM verification_flows
     WHERE developer_email = $1 AND is_active = true
     ORDER BY created_at DESC`,
    [req.developer!.email]
  );
  res.json({ flows });
});

// ─── POST /developer/flows ───────────────────────────────────────────────────
router.post('/', validateBody(flowSchema), async (req: Request, res: Response): Promise<void> => {
  const d = req.body as z.infer<typeof flowSchema>;
  const flow = await queryOne(
    `INSERT INTO verification_flows
       (developer_email, name, description, required_steps, optional_steps,
        allowed_id_types, allowed_countries, min_verification_level,
        success_url, failure_url, brand_name, brand_color, welcome_message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      req.developer!.email,
      d.name,
      d.description ?? null,
      d.required_steps,
      d.optional_steps,
      d.allowed_id_types,
      d.allowed_countries ?? null,
      d.min_verification_level,
      d.success_url ?? null,
      d.failure_url ?? null,
      d.brand_name ?? null,
      d.brand_color ?? null,
      d.welcome_message ?? null,
    ]
  );
  res.status(201).json({ flow });
});

// ─── GET /developer/flows/:id ────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const flow = await queryOne(
    `SELECT * FROM verification_flows WHERE id = $1 AND developer_email = $2`,
    [req.params.id, req.developer!.email]
  );
  if (!flow) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({ flow });
});

// ─── PATCH /developer/flows/:id ──────────────────────────────────────────────
router.patch('/:id', validateBody(flowSchema.partial()), async (req: Request, res: Response): Promise<void> => {
  const d = req.body as Partial<z.infer<typeof flowSchema>>;
  const allowed = new Set([
    'name', 'description', 'required_steps', 'optional_steps', 'allowed_id_types',
    'allowed_countries', 'min_verification_level', 'success_url', 'failure_url',
    'brand_name', 'brand_color', 'welcome_message'
  ]);
  const fields = Object.keys(d).filter((k) => allowed.has(k));
  if (fields.length === 0) {
    res.status(400).json({ error: 'no_fields', message: 'No valid fields to update' });
    return;
  }
  const setClauses = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
  const values = fields.map((f) => (d as Record<string, unknown>)[f]);
  const flow = await queryOne(
    `UPDATE verification_flows
     SET ${setClauses}, updated_at = NOW()
     WHERE id = $1 AND developer_email = $2 AND is_active = true
     RETURNING *`,
    [req.params.id, req.developer!.email, ...values]
  );
  if (!flow) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({ flow });
});

// ─── DELETE /developer/flows/:id ─────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const flow = await queryOne<{ id: string }>(
    `UPDATE verification_flows SET is_active = false, updated_at = NOW()
     WHERE id = $1 AND developer_email = $2 AND is_active = true
     RETURNING id`,
    [req.params.id, req.developer!.email]
  );
  if (!flow) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({ success: true });
});

export default router;
