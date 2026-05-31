import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db';
import { authenticate, requireSeller } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { SellerProfileRow, ProductRow } from '../types';

export const sellersRouter = Router();

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const createSellerSchema = z.object({
  shop_name:   z.string().min(2).max(80),
  description: z.string().max(1000).optional(),
});

sellersRouter.post(
  '/',
  authenticate,
  validate(createSellerSchema),
  async (req: Request, res: Response): Promise<void> => {
    if (req.user!.seller_profile_id) {
      res.status(409).json({ error: 'seller_profile_exists' });
      return;
    }
    const { shop_name, description } = req.body;
    let slug = slugify(shop_name);
    const existing = await queryOne('SELECT id FROM seller_profiles WHERE slug = $1', [slug]);
    if (existing) slug = `${slug}-${Date.now()}`;

    const [profile] = await query<SellerProfileRow>(
      `INSERT INTO seller_profiles (user_id, shop_name, slug, description)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user!.id, shop_name, slug, description ?? null]
    );
    await query(
      `UPDATE users SET role = 'seller', updated_at = NOW() WHERE id = $1`,
      [req.user!.id]
    );
    res.status(201).json({ seller: profile });
  }
);

sellersRouter.get('/me', authenticate, requireSeller, async (req: Request, res: Response): Promise<void> => {
  const profile = await queryOne<SellerProfileRow>(
    'SELECT * FROM seller_profiles WHERE id = $1',
    [req.user!.seller_profile_id]
  );
  res.json({ seller: profile });
});

sellersRouter.get('/me/products', authenticate, requireSeller, async (req: Request, res: Response): Promise<void> => {
  const products = await query<ProductRow>(
    `SELECT p.*, COALESCE(json_agg(pi ORDER BY pi.sort_order) FILTER (WHERE pi.id IS NOT NULL), '[]') AS images
     FROM products p
     LEFT JOIN product_images pi ON pi.product_id = p.id
     WHERE p.seller_id = $1
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
    [req.user!.seller_profile_id]
  );
  res.json({ products });
});

sellersRouter.get('/:slug', async (req: Request, res: Response): Promise<void> => {
  const profile = await queryOne<SellerProfileRow>(
    'SELECT * FROM seller_profiles WHERE slug = $1',
    [req.params.slug]
  );
  if (!profile) { res.status(404).json({ error: 'not_found' }); return; }
  const products = await query<ProductRow>(
    `SELECT p.*, COALESCE(json_agg(pi ORDER BY pi.sort_order) FILTER (WHERE pi.id IS NOT NULL), '[]') AS images
     FROM products p
     LEFT JOIN product_images pi ON pi.product_id = p.id
     WHERE p.seller_id = $1 AND p.status = 'active'
     GROUP BY p.id
     ORDER BY p.created_at DESC
     LIMIT 20`,
    [profile.id]
  );
  res.json({ seller: profile, products });
});
