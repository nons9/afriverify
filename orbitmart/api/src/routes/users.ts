import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AddressRow } from '../types';

export const usersRouter = Router();

usersRouter.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  res.json({ user: req.user });
});

const addressSchema = z.object({
  label:       z.string().min(1).max(30).default('Home'),
  full_name:   z.string().min(2).max(100),
  phone:       z.string().min(7).max(20),
  line1:       z.string().min(3).max(200),
  line2:       z.string().max(200).optional(),
  city:        z.string().min(2).max(100),
  state:       z.string().min(2).max(100),
  country:     z.string().length(2).default('NG'),
  postal_code: z.string().max(20).optional(),
  is_default:  z.boolean().default(false),
});

usersRouter.get('/me/addresses', authenticate, async (req: Request, res: Response): Promise<void> => {
  const addresses = await query<AddressRow>(
    'SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
    [req.user!.id]
  );
  res.json({ addresses });
});

usersRouter.post(
  '/me/addresses',
  authenticate,
  validate(addressSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { label, full_name, phone, line1, line2, city, state, country, postal_code, is_default } = req.body;
    if (is_default) {
      await query('UPDATE addresses SET is_default = FALSE WHERE user_id = $1', [req.user!.id]);
    }
    const [address] = await query<AddressRow>(
      `INSERT INTO addresses (user_id, label, full_name, phone, line1, line2, city, state, country, postal_code, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user!.id, label, full_name, phone, line1, line2 ?? null, city, state, country, postal_code ?? null, is_default]
    );
    res.status(201).json({ address });
  }
);

usersRouter.delete('/me/addresses/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const address = await queryOne<AddressRow>(
    'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user!.id]
  );
  if (!address) { res.status(404).json({ error: 'not_found' }); return; }
  await query('DELETE FROM addresses WHERE id = $1', [req.params.id]);
  res.json({ deleted: true });
});
