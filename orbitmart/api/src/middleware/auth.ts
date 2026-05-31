import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { queryOne } from '../db';
import { UserRow } from '../types';

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing_token' });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.SESSION_JWT_SECRET!) as { sub: string };
    const user = await queryOne<UserRow>(
      `SELECT u.*, sp.id as seller_profile_id, sp.shop_name, sp.kyc_level
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       WHERE u.id = $1 AND u.is_active = TRUE`,
      [payload.sub]
    );
    if (!user) {
      res.status(401).json({ error: 'user_not_found' });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

export function requireSeller(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.seller_profile_id) {
    res.status(403).json({ error: 'seller_profile_required', message: 'Create a seller profile first.' });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'admin_required' });
    return;
  }
  next();
}
