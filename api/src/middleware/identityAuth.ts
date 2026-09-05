import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Authenticates the person an identity belongs to, not a platform's
// developer (sessionAuth) or a platform's own API key (authenticate) - a
// separate JWT secret keeps a stolen developer session from also granting
// access to end users' own identity portal accounts, and vice versa.
export function identityAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized', message: 'Login required' });
    return;
  }

  const token = auth.slice(7);
  try {
    const secret = process.env.IDENTITY_SESSION_JWT_SECRET;
    if (!secret) throw new Error('IDENTITY_SESSION_JWT_SECRET not configured');
    const payload = jwt.verify(token, secret) as { sub: string; phone: string };
    req.identity = { identityId: payload.sub, phone: payload.phone };
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired session' });
  }
}
