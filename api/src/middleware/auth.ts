import { Request, Response, NextFunction } from 'express';
import { sha256 } from '../utils/crypto';
import { queryOne } from '../db';
import { ApiKey } from '../types';
import logger from '../utils/logger';

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const platformHeader = req.headers['x-platform'] as string | undefined;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'Authorization header required: Bearer {api_key}'
    });
    return;
  }

  if (!platformHeader) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'X-Platform header required'
    });
    return;
  }

  const rawKey = authHeader.substring(7).trim();
  if (!rawKey.startsWith('ov_')) {
    res.status(401).json({ error: 'unauthorized', message: 'Invalid API key format' });
    return;
  }

  const keyHash = sha256(rawKey);

  try {
    const apiKey = await queryOne<ApiKey>(
      'SELECT * FROM api_keys WHERE api_key_hash = $1 AND is_active = true',
      [keyHash]
    );

    if (!apiKey) {
      logger.warn('Invalid API key', { prefix: rawKey.substring(0, 12), platform: platformHeader });
      res.status(401).json({ error: 'unauthorized', message: 'Invalid or inactive API key' });
      return;
    }

    // Fire-and-forget last_used update
    queryOne(
      'UPDATE api_keys SET last_used = NOW() WHERE id = $1',
      [apiKey.id]
    ).catch((err: Error) => logger.error('last_used update failed', { error: err.message }));

    req.apiKey = apiKey;
    req.platform = platformHeader;
    next();
  } catch (err) {
    logger.error('Auth middleware error', { error: (err as Error).message });
    res.status(500).json({ error: 'internal_error', message: 'Authentication failed' });
  }
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const perms = (req.apiKey?.permissions ?? []) as string[];
    if (!perms.includes(permission)) {
      res.status(403).json({
        error: 'forbidden',
        message: `API key missing permission: ${permission}`
      });
      return;
    }
    next();
  };
}
