import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query, queryOne } from '../db';
import { validate } from '../middleware/validate';
import { UserRow } from '../types';

const authRouter = Router();

const registerSchema = z.object({
  email:     z.string().email(),
  password:  z.string().min(8).max(128),
  full_name: z.string().min(2).max(100),
  role:      z.enum(['buyer', 'seller']).default('buyer'),
});

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string(),
});

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(`${salt}:${key.toString('hex')}`);
    });
  });
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else {
        try {
          resolve(crypto.timingSafeEqual(Buffer.from(key.toString('hex')), Buffer.from(hash)));
        } catch {
          resolve(false);
        }
      }
    });
  });
}

function signToken(user: UserRow): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    process.env.SESSION_JWT_SECRET!,
    { expiresIn: '30d' }
  );
}

authRouter.post('/register', validate(registerSchema), async (req: Request, res: Response): Promise<void> => {
  const { email, password, full_name, role } = req.body;
  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing) {
    res.status(409).json({ error: 'email_taken' });
    return;
  }
  const password_hash = await hashPassword(password);
  const [user] = await query<UserRow>(
    `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1,$2,$3,$4) RETURNING *`,
    [email.toLowerCase(), password_hash, full_name, role]
  );
  const token = signToken(user);
  res.status(201).json({
    token,
    user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
  });
});

authRouter.post('/login', validate(loginSchema), async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  const user = await queryOne<UserRow>(
    'SELECT * FROM users WHERE email = $1 AND is_active = TRUE',
    [email.toLowerCase()]
  );
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }
  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
  });
});

export default authRouter;
