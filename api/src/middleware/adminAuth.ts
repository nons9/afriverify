import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AdminPayload {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminPayload;
    }
  }
}

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized', message: 'Admin token required' });
    return;
  }

  const token = auth.slice(7);
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'config_error', message: 'Admin auth not configured' });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as AdminPayload;
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token', message: 'Admin token invalid or expired' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      res.status(403).json({ error: 'forbidden', message: 'Insufficient admin role' });
      return;
    }
    next();
  };
}
