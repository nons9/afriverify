import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db';
import { authenticate, requireSeller } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { ProductRow } from '../types';

export const productsRouter = Router();

const createProductSchema = z.object({
  category_id:   z.string().uuid(),
  title:         z.string().min(3).max(200),
  description:   z.string().min(10).max(5000),
  price:         z.number().int().positive(),
  compare_price: z.number().int().positive().optional(),
  stock:         z.number().int().min(0).default(1),
  condition:     z.enum(['new', 'like_new', 'good', 'fair', 'poor']).default('new'),
  location:      z.string().max(100).optional(),
  tags:          z.array(z.string().max(30)).max(10).default([]),
  images:        z.array(z.object({ url: z.string().url(), alt: z.string().optional(), is_primary: z.boolean().default(false) })).min(1).max(8),
});

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

productsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const page  = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(40, parseInt(req.query.limit as string) || 20);
  const offset = (page - 1) * limit;
  const { category, q, min_price, max_price, condition, sort } = req.query as Record<string, string>;

  const conditions: string[] = ["p.status = 'active'"];
  const params: unknown[] = [];
  let idx = 1;

  if (category) { conditions.push(`c.slug = $${idx++}`); params.push(category); }
  if (q)        { conditions.push(`p.search_vec @@ plainto_tsquery('english', $${idx++})`); params.push(q); }
  if (min_price){ conditions.push(`p.price >= $${idx++}`); params.push(parseInt(min_price)); }
  if (max_price){ conditions.push(`p.price <= $${idx++}`); params.push(parseInt(max_price)); }
  if (condition){ conditions.push(`p.condition = $${idx++}`); params.push(condition); }

  const orderMap: Record<string, string> = {
    newest:    'p.created_at DESC',
    price_asc: 'p.price ASC',
    price_desc:'p.price DESC',
    popular:   'p.view_count DESC',
  };
  const orderBy = orderMap[sort ?? ''] ?? 'p.created_at DESC';

  const where = conditions.join(' AND ');
  params.push(limit, offset);

  const products = await query<ProductRow>(
    `SELECT p.*,
            json_build_object('id', sp.id, 'shop_name', sp.shop_name, 'slug', sp.slug, 'is_verified', sp.is_verified, 'rating', sp.rating) AS seller,
            COALESCE(json_agg(pi ORDER BY pi.sort_order) FILTER (WHERE pi.id IS NOT NULL), '[]') AS images
     FROM products p
     JOIN seller_profiles sp ON sp.id = p.seller_id
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN product_images pi ON pi.product_id = p.id
     WHERE ${where}
     GROUP BY p.id, sp.id
     ORDER BY ${orderBy}
     LIMIT $${idx++} OFFSET $${idx}`,
    params
  );
  res.json({ products, page, limit });
});

productsRouter.post(
  '/',
  authenticate,
  requireSeller,
  validate(createProductSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { category_id, title, description, price, compare_price, stock, condition, location, tags, images } = req.body;
    let slug = slugify(title);
    const existing = await queryOne('SELECT id FROM products WHERE seller_id = $1 AND slug = $2', [req.user!.seller_profile_id, slug]);
    if (existing) slug = `${slug}-${Date.now()}`;

    const [product] = await query<ProductRow>(
      `INSERT INTO products (seller_id, category_id, title, slug, description, price, compare_price, stock, condition, location, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user!.seller_profile_id, category_id, title, slug, description, price, compare_price ?? null, stock, condition, location ?? null, tags]
    );

    for (let i = 0; i < images.length; i++) {
      await query(
        `INSERT INTO product_images (product_id, url, alt, sort_order, is_primary) VALUES ($1,$2,$3,$4,$5)`,
        [product.id, images[i].url, images[i].alt ?? null, i, i === 0 || images[i].is_primary]
      );
    }

    res.status(201).json({ product });
  }
);

productsRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const product = await queryOne<ProductRow>(
    `SELECT p.*,
            json_build_object('id', sp.id, 'shop_name', sp.shop_name, 'slug', sp.slug, 'is_verified', sp.is_verified, 'rating', sp.rating) AS seller,
            COALESCE(json_agg(pi ORDER BY pi.sort_order) FILTER (WHERE pi.id IS NOT NULL), '[]') AS images
     FROM products p
     JOIN seller_profiles sp ON sp.id = p.seller_id
     LEFT JOIN product_images pi ON pi.product_id = p.id
     WHERE p.id = $1
     GROUP BY p.id, sp.id`,
    [req.params.id]
  );
  if (!product) { res.status(404).json({ error: 'not_found' }); return; }

  await query('UPDATE products SET view_count = view_count + 1 WHERE id = $1', [req.params.id]);
  res.json({ product });
});

productsRouter.patch('/:id/publish', authenticate, requireSeller, async (req: Request, res: Response): Promise<void> => {
  const product = await queryOne<ProductRow>(
    'SELECT * FROM products WHERE id = $1 AND seller_id = $2',
    [req.params.id, req.user!.seller_profile_id]
  );
  if (!product) { res.status(404).json({ error: 'not_found' }); return; }
  await query(`UPDATE products SET status = 'active', updated_at = NOW() WHERE id = $1`, [req.params.id]);
  res.json({ published: true });
});

productsRouter.delete('/:id', authenticate, requireSeller, async (req: Request, res: Response): Promise<void> => {
  const product = await queryOne<ProductRow>(
    'SELECT * FROM products WHERE id = $1 AND seller_id = $2',
    [req.params.id, req.user!.seller_profile_id]
  );
  if (!product) { res.status(404).json({ error: 'not_found' }); return; }
  await query(`UPDATE products SET status = 'removed', updated_at = NOW() WHERE id = $1`, [req.params.id]);
  res.json({ removed: true });
});
