import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export function sessionAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized', message: 'Session token required' });
    return;
  }

  const token = auth.slice(7);
  // API keys start with 'av_' — they belong to authenticate(), not sessionAuth
  if (token.startsWith('av_')) {
    res.status(401).json({ error: 'unauthorized', message: 'Portal session token required' });
    return;
  }

  try {
    const secret = process.env.SESSION_JWT_SECRET;
    if (!secret) throw new Error('SESSION_JWT_SECRET not configured');
    const payload = jwt.verify(token, secret) as { sub: string; email: string; company: string };
    req.developer = { id: payload.sub, email: payload.email, company: payload.company };
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired session' });
  }
}
