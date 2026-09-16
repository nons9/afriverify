import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sessionAuth } from '../middleware/sessionAuth';
import { query, queryOne } from '../db';

const router = Router();

// GET /v1/developer/compliance/export
// Returns a JSON audit trail of all verification events for the developer's
// keys - structured for NDPR / regulatory data-subject requests.
// Query params: start_date, end_date, identity_id (optional filter), format=json|csv
router.get('/export', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const parseSchema = z.object({
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    identity_id: z.string().uuid().optional(),
    format: z.enum(['json', 'csv']).default('json'),
    limit: z.coerce.number().int().min(1).max(10_000).default(5_000),
  });

  const parsed = parseSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_params', details: parsed.error.flatten() });
    return;
  }

  const { start_date, end_date, identity_id, format, limit } = parsed.data;
  const email = req.developer!.email;

  const conditions: string[] = ['ak.platform_email = $1'];
  const params: unknown[] = [email];
  let idx = 2;

  if (start_date) { conditions.push(`ve.created_at >= $${idx++}::date`); params.push(start_date); }
  if (end_date)   { conditions.push(`ve.created_at < ($${idx++}::date + INTERVAL '1 day')`); params.push(end_date); }
  if (identity_id){ conditions.push(`ve.identity_id = $${idx++}`); params.push(identity_id); }
  params.push(limit);

  const events = await query<{
    event_id: string;
    event_type: string;
    result: string;
    platform: string | null;
    api_key_prefix: string;
    identity_id: string | null;
    risk_score: number | null;
    geo_country: string | null;
    created_at: string;
  }>(
    `SELECT ve.id AS event_id, ve.event_type::text, ve.result::text, ve.platform,
            ak.api_key_prefix, ve.identity_id::text, ve.risk_score, ve.geo_country,
            ve.created_at
     FROM verification_events ve
     JOIN api_keys ak ON ak.id = ve.api_key_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ve.created_at DESC
     LIMIT $${idx}`,
    params
  );

  const [summary, keyCount] = await Promise.all([
    queryOne<{ total_events: string; unique_identities: string }>(
      `SELECT COUNT(ve.id)::text AS total_events,
              COUNT(DISTINCT ve.identity_id)::text AS unique_identities
       FROM verification_events ve
       JOIN api_keys ak ON ak.id = ve.api_key_id
       WHERE ak.platform_email = $1`,
      [email]
    ),
    queryOne<{ active_keys: string }>(
      `SELECT COUNT(*)::text AS active_keys FROM api_keys WHERE platform_email = $1 AND is_active = true`,
      [email]
    ),
  ]);

  const exportDoc = {
    generated_at: new Date().toISOString(),
    generated_by: email,
    regulation: 'NDPR (Nigeria Data Protection Regulation) / GDPR-aligned',
    filters: { start_date: start_date ?? null, end_date: end_date ?? null, identity_id: identity_id ?? null },
    summary: {
      total_events: parseInt(summary?.total_events ?? '0'),
      unique_identities: parseInt(summary?.unique_identities ?? '0'),
      active_api_keys: parseInt(keyCount?.active_keys ?? '0'),
      exported_rows: events.length,
    },
    events,
  };

  if (format === 'csv') {
    const headers = ['event_id', 'event_type', 'result', 'platform', 'api_key_prefix',
                     'identity_id', 'risk_score', 'geo_country', 'created_at'];
    const csvLines = [
      headers.join(','),
      ...events.map((e) =>
        headers.map((h) => {
          const val = (e as Record<string, unknown>)[h];
          return val == null ? '' : `"${String(val).replace(/"/g, '""')}"`;
        }).join(',')
      ),
    ];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="afriverify-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csvLines.join('\n'));
    return;
  }

  res.json(exportDoc);
});

// GET /v1/developer/compliance/cases - list review cases (session auth)
router.get('/cases', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const { status, priority } = req.query as { status?: string; priority?: string };
  const email = req.developer!.email;

  const conditions: string[] = ['developer_email = $1'];
  const params: unknown[] = [email];
  let idx = 2;

  if (status)   { conditions.push(`status = $${idx++}`);   params.push(status); }
  if (priority) { conditions.push(`priority = $${idx++}`); params.push(priority); }

  const cases = await query<{
    id: string; case_ref: string; reason: string; status: string;
    priority: string; identity_id: string | null; assignee: string | null;
    created_at: string; updated_at: string;
  }>(
    `SELECT id, case_ref, reason, status::text, priority::text, identity_id::text,
            assignee, created_at, updated_at
     FROM review_cases WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 200`,
    params
  );

  res.json({ cases });
});

// POST /v1/developer/compliance/cases - open a review case (session auth)
router.post('/cases', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const bodySchema = z.object({
    identity_id: z.string().uuid().optional(),
    session_id: z.string().uuid().optional(),
    api_key_id: z.string().uuid().optional(),
    reason: z.string().min(5).max(2000),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    metadata: z.record(z.unknown()).default({}),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }

  const { identity_id, session_id, api_key_id, reason, priority, metadata } = parsed.data;

  const rows = await query<{ id: string; case_ref: string; created_at: string }>(
    `INSERT INTO review_cases
       (identity_id, session_id, api_key_id, developer_email, reason, priority, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, case_ref, created_at`,
    [identity_id ?? null, session_id ?? null, api_key_id ?? null,
     req.developer!.email, reason, priority, JSON.stringify(metadata)]
  );

  res.status(201).json({ id: rows[0].id, case_ref: rows[0].case_ref, created_at: rows[0].created_at });
});

// PATCH /v1/developer/compliance/cases/:id - update status / assignee / notes (session auth)
router.patch('/cases/:id', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const bodySchema = z.object({
    status: z.enum(['open', 'under_review', 'approved', 'rejected', 'escalated']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    assignee: z.string().max(255).nullable().optional(),
    resolution_note: z.string().max(5000).nullable().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }

  const updates = parsed.data;
  const setParts: string[] = ['updated_at = NOW()'];
  const vals: unknown[] = [];
  let idx = 1;

  if (updates.status !== undefined)          { setParts.push(`status = $${idx++}`);          vals.push(updates.status); }
  if (updates.priority !== undefined)        { setParts.push(`priority = $${idx++}`);        vals.push(updates.priority); }
  if (updates.assignee !== undefined)        { setParts.push(`assignee = $${idx++}`);        vals.push(updates.assignee); }
  if (updates.resolution_note !== undefined) { setParts.push(`resolution_note = $${idx++}`); vals.push(updates.resolution_note); }

  if (['approved', 'rejected'].includes(updates.status ?? '')) {
    setParts.push(`resolved_by = $${idx++}`, `resolved_at = NOW()`);
    vals.push(req.developer!.email);
  }

  vals.push(id, req.developer!.email);
  const result = await query<{ id: string }>(
    `UPDATE review_cases SET ${setParts.join(', ')}
     WHERE id = $${idx++} AND developer_email = $${idx} RETURNING id`,
    vals
  );

  if (result.length === 0) {
    res.status(404).json({ error: 'not_found', message: 'Case not found' });
    return;
  }

  res.json({ success: true });
});

export default router;
