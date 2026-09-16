import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import jwt from 'jsonwebtoken';
import { validateBody } from '../middleware/validate';
import { query, queryOne } from '../db';
import logger from '../utils/logger';
import { sendWelcomeEmail } from '../services/email-billing.service';

const router = Router();
const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, 'hex');
  const derivedHash = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(hashBuffer, derivedHash);
}

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
    }>(
      'SELECT id, email, password_hash, company_name, full_name, is_active FROM developers WHERE email = $1',
      [normalizedEmail]
    );

    if (!dev || !dev.is_active || !(await verifyPassword(password, dev.password_hash))) {
      res.status(401).json({ error: 'unauthorized', message: 'Invalid credentials' });
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

export default router;
