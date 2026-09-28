import type { Request, Response, NextFunction } from 'express';
import { verifyVit } from '../verify.js';
import type { VerifyVitOptions, VitClaims } from '../types.js';

declare global {
  namespace Express {
    interface Request {
      vit?: VitClaims;
    }
  }
}

export function requireVit(options: VerifyVitOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.slice(7);
    const result = await verifyVit(token, options);

    if (!result.valid) {
      res.status(401).json({ error: result.error });
      return;
    }

    req.vit = result.claims;
    next();
  };
}
