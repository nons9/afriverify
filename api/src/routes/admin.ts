import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../db';
import { adminAuth, requireRole } from '../middleware/adminAuth';
import { validateBody } from '../middleware/validate';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function signAdminToken(payload: { id: string; email: string; full_name: string; role: string }): string {
  const secret = process.env.ADMIN_JWT_SECRET!;
  return jwt.sign(payload, secret, { expiresIn: '12h' });
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

router.post('/auth/login', validateBody(loginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;
  try {
    const { rows } = await pool.query(
      'SELECT id, email, full_name, role, password_hash, is_active FROM admin_users WHERE email = $1',
      [email.toLowerCase()]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      res.status(401).json({ error: 'invalid_credentials', message: 'Email or password incorrect' });
      return;
    }

    const [salt, stored] = user.password_hash.split(':');
    const attempt = hashPassword(password, salt);
    if (attempt !== stored) {
      res.status(401).json({ error: 'invalid_credentials', message: 'Email or password incorrect' });
      return;
    }

    await pool.query('UPDATE admin_users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const token = signAdminToken({ id: user.id, email: user.email, full_name: user.full_name, role: user.role });
    res.json({ token, admin: { id: user.id, email: user.email, full_name: user.full_name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: (err as Error).message });
  }
});

router.get('/auth/me', adminAuth, (req: Request, res: Response) => {
  res.json({ admin: req.admin });
});

// ─── Developers ───────────────────────────────────────────────────────────────

router.get('/developers', adminAuth, async (req: Request, res: Response) => {
  const { search, plan, status, limit = '50', offset = '0' } = req.query as Record<string, string>;
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(d.email ILIKE $${params.length} OR d.company_name ILIKE $${params.length} OR d.full_name ILIKE $${params.length})`);
    }
    if (plan) {
      params.push(plan);
      conditions.push(`sub.plan = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`sub.status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const { rows } = await pool.query(
      `SELECT
         d.id, d.email, d.full_name, d.company_name, d.phone, d.is_verified, d.created_at,
         sub.plan, sub.status AS sub_status, sub.amount_cents, sub.currency, sub.billing_cycle,
         sub.current_period_end,
         COUNT(ak.id) AS key_count,
         COALESCE(SUM(ak.verifications_this_month), 0) AS verifications_this_month,
         COALESCE(SUM(ak.total_verifications), 0) AS total_verifications
       FROM developers d
       LEFT JOIN api_keys ak ON ak.developer_id = d.id
       LEFT JOIN subscriptions sub ON sub.api_key_id = ak.id AND sub.status IN ('active','trialing')
       ${where}
       GROUP BY d.id, d.email, d.full_name, d.company_name, d.phone, d.is_verified, d.created_at,
                sub.plan, sub.status, sub.amount_cents, sub.currency, sub.billing_cycle, sub.current_period_end
       ORDER BY d.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(DISTINCT d.id) AS total
       FROM developers d
       LEFT JOIN api_keys ak ON ak.developer_id = d.id
       LEFT JOIN subscriptions sub ON sub.api_key_id = ak.id AND sub.status IN ('active','trialing')
       ${where}`,
      params.slice(0, -2)
    );

    res.json({ developers: rows, total: parseInt(countRows[0].total, 10) });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: (err as Error).message });
  }
});

router.get('/developers/:email', adminAuth, async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, sub.plan, sub.status AS sub_status, sub.amount_cents, sub.currency,
              sub.billing_cycle, sub.current_period_start, sub.current_period_end,
              sub.cancel_at_period_end, sub.trial_ends_at
       FROM developers d
       LEFT JOIN api_keys ak ON ak.developer_id = d.id AND ak.environment = 'live'
       LEFT JOIN subscriptions sub ON sub.api_key_id = ak.id AND sub.status IN ('active','trialing')
       WHERE d.email = $1
       LIMIT 1`,
      [String(req.params.email).toLowerCase()]
    );
    if (!rows[0]) { res.status(404).json({ error: 'not_found' }); return; }

    const dev = rows[0];

    const [keysRes, invoicesRes, verifRes] = await Promise.all([
      pool.query(
        `SELECT id, platform_name, environment, scope, intent, is_active,
                verifications_this_month, total_verifications, created_at
         FROM api_keys WHERE developer_id = $1 ORDER BY created_at DESC`,
        [dev.id]
      ),
      pool.query(
        `SELECT i.invoice_number, i.status, i.total_amount_cents, i.currency,
                i.period_start, i.period_end, i.paid_at, i.created_at
         FROM invoices i
         JOIN api_keys ak ON ak.id = i.api_key_id
         WHERE ak.developer_id = $1
         ORDER BY i.created_at DESC LIMIT 20`,
        [dev.id]
      ),
      pool.query(
        `SELECT DATE_TRUNC('month', created_at) AS month, COUNT(*) AS count
         FROM verification_sessions
         WHERE developer_id = $1
         GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
        [dev.id]
      ),
    ]);

    res.json({
      developer: dev,
      api_keys: keysRes.rows,
      invoices: invoicesRes.rows,
      verifications_by_month: verifRes.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: (err as Error).message });
  }
});

const patchDeveloperSchema = z.object({
  is_verified: z.boolean().optional(),
  plan: z.enum(['free', 'starter', 'growth', 'enterprise', 'pay_per_use']).optional(),
  note: z.string().max(500).optional(),
});

router.patch(
  '/developers/:email',
  adminAuth,
  requireRole('super_admin', 'ops'),
  validateBody(patchDeveloperSchema),
  async (req: Request, res: Response) => {
    const { is_verified, plan } = req.body as z.infer<typeof patchDeveloperSchema>;
    try {
      if (is_verified !== undefined) {
        await pool.query('UPDATE developers SET is_verified = $1 WHERE email = $2', [is_verified, String(req.params.email)]);
      }
      if (plan) {
        await pool.query(
          `UPDATE subscriptions SET plan = $1, updated_at = NOW()
           WHERE api_key_id IN (
             SELECT ak.id FROM api_keys ak
             JOIN developers d ON d.id = ak.developer_id
             WHERE d.email = $2
           )`,
          [plan, String(req.params.email)]
        );
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: (err as Error).message });
    }
  }
);

// ─── Identities ──────────────────────────────────────────────────────────────

router.get('/identities', adminAuth, async (req: Request, res: Response) => {
  const { search, limit = '50', offset = '0' } = req.query as Record<string, string>;
  try {
    const params: unknown[] = [];
    let where = '';

    if (search) {
      params.push(`%${search}%`);
      where = `WHERE vi.phone ILIKE $1 OR vi.full_name ILIKE $1 OR vi.id::text ILIKE $1`;
    }

    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const { rows } = await pool.query(
      `SELECT vi.id, vi.phone, vi.full_name, vi.verification_level,
              vi.trust_score, vi.aml_status, vi.is_blacklisted, vi.created_at,
              COUNT(vs.id) AS session_count
       FROM verified_identities vi
       LEFT JOIN verification_sessions vs ON vs.identity_id = vi.id
       ${where}
       GROUP BY vi.id
       ORDER BY vi.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ identities: rows });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: (err as Error).message });
  }
});

router.get('/identities/:id', adminAuth, async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM verified_identities WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0]) { res.status(404).json({ error: 'not_found' }); return; }

    const [sessionsRes, blRes] = await Promise.all([
      pool.query(
        `SELECT id, type, status, risk_level, created_at, completed_at
         FROM verification_sessions WHERE identity_id = $1
         ORDER BY created_at DESC LIMIT 20`,
        [req.params.id]
      ),
      pool.query('SELECT * FROM blacklist WHERE identity_id = $1', [req.params.id]),
    ]);

    res.json({
      identity: rows[0],
      sessions: sessionsRes.rows,
      blacklist_entries: blRes.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: (err as Error).message });
  }
});

// ─── Blacklist ───────────────────────────────────────────────────────────────

router.get('/blacklist', adminAuth, async (req: Request, res: Response) => {
  const { type, scope, limit = '50', offset = '0' } = req.query as Record<string, string>;
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (type) { params.push(type); conditions.push(`type = $${params.length}`); }
    if (scope) { params.push(scope); conditions.push(`scope = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const { rows } = await pool.query(
      `SELECT id, identity_id, type, value, reason, scope, reported_by_platform,
              added_by, confirmed_at, created_at
       FROM blacklist ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ entries: rows });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: (err as Error).message });
  }
});

const blacklistAddSchema = z.object({
  type: z.enum(['face_hash', 'device_id', 'phone', 'ip_range', 'id_number_hash']),
  value: z.string().min(1).max(64),
  reason: z.string().min(3).max(500),
  scope: z.enum(['platform', 'global']).default('platform'),
  identity_id: z.string().uuid().optional(),
});

router.post(
  '/blacklist',
  adminAuth,
  requireRole('super_admin', 'ops'),
  validateBody(blacklistAddSchema),
  async (req: Request, res: Response) => {
    const { type, value, reason, scope, identity_id } = req.body as z.infer<typeof blacklistAddSchema>;
    try {
      const hashed = ['face_hash', 'id_number_hash'].includes(type)
        ? crypto.createHash('sha256').update(value).digest('hex')
        : value;

      const { rows } = await pool.query(
        `INSERT INTO blacklist (identity_id, type, value, reason, scope, added_by, confirmed_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING *`,
        [identity_id ?? null, type, hashed, reason, scope, req.admin!.email]
      );

      if (identity_id) {
        await pool.query('UPDATE verified_identities SET is_blacklisted = TRUE WHERE id = $1', [identity_id]);
      }

      res.status(201).json({ entry: rows[0] });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: (err as Error).message });
    }
  }
);

router.delete(
  '/blacklist/:id',
  adminAuth,
  requireRole('super_admin', 'ops'),
  async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        'DELETE FROM blacklist WHERE id = $1 RETURNING identity_id',
        [req.params.id]
      );
      if (!rows[0]) { res.status(404).json({ error: 'not_found' }); return; }

      if (rows[0].identity_id) {
        const remaining = await pool.query(
          'SELECT 1 FROM blacklist WHERE identity_id = $1 LIMIT 1',
          [rows[0].identity_id]
        );
        if (!remaining.rows.length) {
          await pool.query('UPDATE verified_identities SET is_blacklisted = FALSE WHERE id = $1', [rows[0].identity_id]);
        }
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: (err as Error).message });
    }
  }
);

// ─── Revenue ─────────────────────────────────────────────────────────────────

router.get('/revenue', adminAuth, requireRole('super_admin', 'finance'), async (_req: Request, res: Response) => {
  try {
    const [mrrRes, arrRes, planRes, invoiceRes, recentRes] = await Promise.all([
      pool.query(`
        SELECT COALESCE(SUM(amount_cents), 0) AS mrr
        FROM subscriptions
        WHERE status IN ('active','trialing') AND billing_cycle = 'monthly'
      `),
      pool.query(`
        SELECT COALESCE(SUM(amount_cents / 12), 0) AS arr_from_annual,
               COALESCE(SUM(CASE WHEN billing_cycle = 'monthly' THEN amount_cents * 12 ELSE 0 END), 0) AS arr_from_monthly
        FROM subscriptions
        WHERE status IN ('active','trialing')
      `),
      pool.query(`
        SELECT plan, status, COUNT(*) AS count, COALESCE(SUM(amount_cents), 0) AS total_cents
        FROM subscriptions
        GROUP BY plan, status
        ORDER BY plan
      `),
      pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount_cents ELSE 0 END), 0) AS paid_cents,
          COALESCE(SUM(CASE WHEN status = 'open' THEN total_amount_cents ELSE 0 END), 0) AS open_cents,
          COUNT(CASE WHEN status = 'paid' THEN 1 END) AS paid_count,
          COUNT(CASE WHEN status = 'open' THEN 1 END) AS open_count
        FROM invoices
        WHERE created_at >= DATE_TRUNC('month', NOW())
      `),
      pool.query(`
        SELECT invoice_number, status, total_amount_cents, currency,
               period_start, period_end, paid_at, created_at
        FROM invoices
        ORDER BY created_at DESC LIMIT 20
      `),
    ]);

    const mrr = parseInt(mrrRes.rows[0].mrr, 10);
    const annualFromAnnual = parseInt(arrRes.rows[0].arr_from_annual, 10);
    const annualFromMonthly = parseInt(arrRes.rows[0].arr_from_monthly, 10);
    const arr = annualFromAnnual + annualFromMonthly;

    res.json({
      mrr_cents: mrr,
      arr_cents: arr,
      plan_breakdown: planRes.rows,
      current_month: invoiceRes.rows[0],
      recent_invoices: recentRes.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: (err as Error).message });
  }
});

router.get('/revenue/mrr-history', adminAuth, requireRole('super_admin', 'finance'), async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        DATE_TRUNC('month', paid_at) AS month,
        COALESCE(SUM(total_amount_cents), 0) AS revenue_cents,
        COUNT(*) AS invoice_count
      FROM invoices
      WHERE status = 'paid' AND paid_at >= NOW() - INTERVAL '12 months'
      GROUP BY 1
      ORDER BY 1 ASC
    `);
    res.json({ history: rows });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: (err as Error).message });
  }
});

// ─── API Keys (admin view) ────────────────────────────────────────────────────

router.get('/api-keys', adminAuth, async (req: Request, res: Response) => {
  const { developer_email, environment, is_active, limit = '50', offset = '0' } = req.query as Record<string, string>;
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (developer_email) {
      params.push(`%${developer_email}%`);
      conditions.push(`d.email ILIKE $${params.length}`);
    }
    if (environment) {
      params.push(environment);
      conditions.push(`ak.environment = $${params.length}`);
    }
    if (is_active !== undefined) {
      params.push(is_active === 'true');
      conditions.push(`ak.is_active = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const { rows } = await pool.query(
      `SELECT ak.id, ak.platform_name, ak.environment, ak.scope, ak.intent,
              ak.is_active, ak.tier, ak.monthly_limit,
              ak.verifications_this_month, ak.total_verifications,
              ak.created_at, d.email AS developer_email, d.company_name
       FROM api_keys ak
       JOIN developers d ON d.id = ak.developer_id
       ${where}
       ORDER BY ak.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ keys: rows });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: (err as Error).message });
  }
});

const patchKeySchema = z.object({
  is_active:     z.boolean().optional(),
  tier:          z.enum(['free', 'starter', 'growth', 'enterprise']).optional(),
  monthly_limit: z.number().int().min(0).max(10_000_000).optional(),
});

router.patch(
  '/api-keys/:id',
  adminAuth,
  requireRole('super_admin', 'ops'),
  validateBody(patchKeySchema),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof patchKeySchema>;
    const setClauses: string[] = [];
    const params: unknown[] = [req.params.id];

    if (body.is_active !== undefined)     { params.push(body.is_active);     setClauses.push(`is_active = $${params.length}`); }
    if (body.tier !== undefined)          { params.push(body.tier);          setClauses.push(`tier = $${params.length}`); }
    if (body.monthly_limit !== undefined) { params.push(body.monthly_limit); setClauses.push(`monthly_limit = $${params.length}`); }

    if (setClauses.length === 0) { res.status(400).json({ error: 'no_fields' }); return; }

    try {
      await pool.query(
        `UPDATE api_keys SET ${setClauses.join(', ')} WHERE id = $1`,
        params
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: (err as Error).message });
    }
  }
);

// ─── Health ───────────────────────────────────────────────────────────────────

router.get('/health', adminAuth, async (_req: Request, res: Response) => {
  try {
    const [dbRes, statsRes] = await Promise.all([
      pool.query('SELECT NOW() AS db_time, COUNT(*) AS conn_count FROM pg_stat_activity'),
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM developers) AS developer_count,
          (SELECT COUNT(*) FROM api_keys WHERE is_active = TRUE) AS active_key_count,
          (SELECT COUNT(*) FROM verified_identities) AS identity_count,
          (SELECT COUNT(*) FROM verification_sessions WHERE created_at >= NOW() - INTERVAL '24 hours') AS sessions_24h,
          (SELECT COUNT(*) FROM verification_sessions
           WHERE created_at >= NOW() - INTERVAL '24 hours' AND status = 'failed') AS failures_24h
      `),
    ]);

    const s = statsRes.rows[0];
    const sessions = parseInt(s.sessions_24h, 10);
    const failures = parseInt(s.failures_24h, 10);
    const failureRate = sessions > 0 ? Math.round((failures / sessions) * 100) : 0;

    res.json({
      status: 'ok',
      db: { time: dbRes.rows[0].db_time, connections: parseInt(dbRes.rows[0].conn_count, 10) },
      stats: {
        developer_count: parseInt(s.developer_count, 10),
        active_key_count: parseInt(s.active_key_count, 10),
        identity_count: parseInt(s.identity_count, 10),
        sessions_24h: sessions,
        failures_24h: failures,
        failure_rate_percent: failureRate,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: (err as Error).message });
  }
});

// ─── Admin user management (super_admin only) ─────────────────────────────────

const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  full_name: z.string().min(2),
  role: z.enum(['super_admin', 'ops', 'support', 'finance']).default('support'),
});

router.post(
  '/users',
  adminAuth,
  requireRole('super_admin'),
  validateBody(createAdminSchema),
  async (req: Request, res: Response) => {
    const { email, password, full_name, role } = req.body as z.infer<typeof createAdminSchema>;
    try {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPassword(password, salt);
      const { rows } = await pool.query(
        `INSERT INTO admin_users (email, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, full_name, role, is_active, created_at`,
        [email.toLowerCase(), `${salt}:${hash}`, full_name, role]
      );
      res.status(201).json({ admin: rows[0] });
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg.includes('unique')) {
        res.status(409).json({ error: 'already_exists', message: 'Admin with this email exists' });
      } else {
        res.status(500).json({ error: 'internal_error', message: msg });
      }
    }
  }
);

router.get('/users', adminAuth, requireRole('super_admin'), async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, full_name, role, is_active, last_login_at, created_at FROM admin_users ORDER BY created_at'
    );
    res.json({ admins: rows });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: (err as Error).message });
  }
});

router.patch(
  '/users/:id',
  adminAuth,
  requireRole('super_admin'),
  async (req: Request, res: Response) => {
    const { is_active, role } = req.body as { is_active?: boolean; role?: string };
    if (req.params.id === req.admin!.id) {
      res.status(400).json({ error: 'cannot_modify_self', message: 'Cannot modify your own account' });
      return;
    }
    try {
      const updates: string[] = [];
      const params: unknown[] = [];
      if (is_active !== undefined) { params.push(is_active); updates.push(`is_active = $${params.length}`); }
      if (role) { params.push(role); updates.push(`role = $${params.length}`); }
      if (!updates.length) { res.status(400).json({ error: 'no_fields' }); return; }
      params.push(req.params.id);
      await pool.query(
        `UPDATE admin_users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
        params
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: (err as Error).message });
    }
  }
);

export default router;
