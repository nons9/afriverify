import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import redis from '../redis';

const verifyInitiateLimit = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:verify:initiate',
  points: 10,
  duration: 86400,
  blockDuration: 3600
});

const apiKeyLimit = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:apikey',
  points: 1000,
  duration: 60
});

const globalIpLimit = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:global:ip',
  points: 300,
  duration: 60
});

export async function rateLimitVerifyInitiate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const phone = req.body?.phone as string | undefined;
  if (!phone) { next(); return; }

  try {
    await verifyInitiateLimit.consume(phone);
    next();
  } catch {
    res.status(429).json({
      error: 'rate_limit_exceeded',
      message: 'Too many verification attempts for this phone number. Retry after 24 hours.',
      retry_after: 86400
    });
  }
}

export async function rateLimitApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.apiKey) { next(); return; }
  try {
    await apiKeyLimit.consume(req.apiKey.id);
    next();
  } catch (e: unknown) {
    const ms = (e as { msBeforeNext?: number }).msBeforeNext ?? 60000;
    res.status(429).json({
      error: 'rate_limit_exceeded',
      message: 'API rate limit: 1000 req/min',
      retry_after: Math.ceil(ms / 1000)
    });
  }
}

export async function rateLimitGlobal(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const ip = req.ip ?? 'unknown';
  try {
    await globalIpLimit.consume(ip);
    next();
  } catch (e: unknown) {
    const ms = (e as { msBeforeNext?: number }).msBeforeNext ?? 60000;
    res.status(429).json({
      error: 'rate_limit_exceeded',
      message: 'Too many requests from this IP.',
      retry_after: Math.ceil(ms / 1000)
    });
  }
}
