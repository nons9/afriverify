import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db';
import { CategoryRow } from '../types';

export const categoriesRouter = Router();

categoriesRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  const categories = await query<CategoryRow>(
    'SELECT * FROM categories WHERE is_active = TRUE ORDER BY sort_order'
  );
  res.json({ categories });
});

categoriesRouter.get('/:slug', async (req: Request, res: Response): Promise<void> => {
  const category = await queryOne<CategoryRow>(
    'SELECT * FROM categories WHERE slug = $1 AND is_active = TRUE',
    [req.params.slug]
  );
  if (!category) { res.status(404).json({ error: 'not_found' }); return; }
  res.json({ category });
});
