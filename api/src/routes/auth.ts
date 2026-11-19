import { Router, Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { validateBody } from '../middleware/validate';
import { query, queryOne } from '../db';
import logger from '../utils/logger';
import { sendWelcomeEmail } from '../services/email-billing.service';
import { hashPassword, verifyPassword } from '../services/password';
import { signMfaToken, verifyMfaToken, verifyLoginCode, notifyOwner } from '../services/mfa.service';

const router = Router();
function signToken(id: string, email: string, company: string): string {
  const secret = process.env.SESSION_JWT_SECRET;
  if (!secret) throw new Error('SESSION_JWT_SECRET not configured');
  return jwt.sign({ sub: id, email, company }, secret, { expiresIn: '7d' });
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  company_name: z.string().min(2).max(100),
  full_name: z.string().min(2).max(100)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

// POST /v1/auth/register
router.post(
  '/register',
  validateBody(registerSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { email, password, company_name, full_name } = req.body as z.infer<typeof registerSchema>;
    const normalizedEmail = email.toLowerCase();

    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM developers WHERE email = $1',
      [normalizedEmail]
    );
    if (existing) {
      res.status(409).json({ error: 'conflict', message: 'Email already registered' });
      return;
    }

    const password_hash = await hashPassword(password);
    const rows = await query<{ id: string }>(
      `INSERT INTO developers (email, password_hash, company_name, full_name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [normalizedEmail, password_hash, company_name, full_name]
    );

    const token = signToken(rows[0].id, normalizedEmail, company_name);
    logger.info('Developer registered', { id: rows[0].id, email: normalizedEmail });

    sendWelcomeEmail({ email: normalizedEmail, fullName: full_name, companyName: company_name })
      .catch((err) => logger.error('Failed to send welcome email', { error: (err as Error).message }));

    res.status(201).json({
      token,
      developer: { id: rows[0].id, email: normalizedEmail, company_name, full_name }
    });
  }
);

// POST /v1/auth/login
router.post(
  '/login',
  validateBody(loginSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const normalizedEmail = email.toLowerCase();

    const dev = await queryOne<{
      id: string;
      email: string;
      password_hash: string;
      company_name: string;
      full_name: string;
      is_active: boolean;
      mfa_enabled_at: string | null;
    }>(
      'SELECT id, email, password_hash, company_name, full_name, is_active, mfa_enabled_at FROM developers WHERE email = $1',
      [normalizedEmail]
    );

    if (!dev || !dev.is_active || !(await verifyPassword(password, dev.password_hash))) {
      res.status(401).json({ error: 'unauthorized', message: 'Invalid credentials' });
      return;
    }

    // Two-step verification: the password alone never produces a session. The person gets a five-minute
    // challenge pass that is only good for the second step.
    if (dev.mfa_enabled_at) {
      res.json({ mfa_required: true, mfa_token: signMfaToken(dev.id) });
      return;
    }

    await query('UPDATE developers SET last_login_at = NOW() WHERE id = $1', [dev.id]);

    const token = signToken(dev.id, dev.email, dev.company_name);
    logger.info('Developer login', { id: dev.id });

    res.json({
      token,
      developer: { id: dev.id, email: dev.email, company_name: dev.company_name, full_name: dev.full_name }
    });
  }
);

const mfaLoginSchema = z.object({
  mfa_token: z.string().min(20).max(2000),
  // a 6-digit authenticator code, or a recovery code (xxxxx-xxxxx)
  code: z.string().min(6).max(32),
});

// POST /v1/auth/login/mfa : the second step
router.post(
  '/login/mfa',
  validateBody(mfaLoginSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { mfa_token, code } = req.body as z.infer<typeof mfaLoginSchema>;
    const id = verifyMfaToken(mfa_token);
    if (!id) {
      res.status(401).json({ error: 'unauthorized', message: 'Your sign-in expired. Start again with your password.' });
      return;
    }

    const dev = await queryOne<{ id: string; email: string; company_name: string; full_name: string; is_active: boolean; mfa_enabled_at: string | null }>(
      'SELECT id, email, company_name, full_name, is_active, mfa_enabled_at FROM developers WHERE id = $1',
      [id]
    );
    if (!dev || !dev.is_active || !dev.mfa_enabled_at) {
      res.status(401).json({ error: 'unauthorized', message: 'Invalid credentials' });
      return;
    }

    const result = await verifyLoginCode(dev.id, code);
    if (!result.ok) {
      if (result.reason === 'locked') {
        res.status(429).json({ error: 'mfa_locked', message: 'Too many wrong codes. Try again in 15 minutes.' });
      } else {
        res.status(401).json({ error: 'invalid_code', message: 'That code is not right. Check the 6 digits in your authenticator app, or use a recovery code.' });
      }
      return;
    }

    await query('UPDATE developers SET last_login_at = NOW() WHERE id = $1', [dev.id]);
    if (result.usedRecovery) void notifyOwner(dev.email, 'recovery_code_used', result.remaining);
    logger.info('Developer login (two-step)', { id: dev.id, recovery: result.usedRecovery });

    res.json({
      token: signToken(dev.id, dev.email, dev.company_name),
      developer: { id: dev.id, email: dev.email, company_name: dev.company_name, full_name: dev.full_name },
      ...(result.usedRecovery ? { recovery_codes_remaining: result.remaining } : {}),
    });
  }
);

export default router;
