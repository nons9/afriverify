import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import redis from '../redis';
import { query } from '../db';
import logger from '../utils/logger';

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
  duration: 60,
});

// Tracks consecutive rate-limit hits per key. 500+ rejections in 1 hour
// signals automated abuse → auto-suspend the key and fire a warning log.
const apiKeyAbuseTracker = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:abuse',
  points: 500,
  duration: 3600,
  blockDuration: 0, // we handle suspension ourselves
});

const globalIpLimit = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:global:ip',
  points: 300,
  duration: 60
});

// A genuine rate-limit rejection from rate-limiter-flexible has msBeforeNext.
// A Redis connection error does not - we fail open so the server stays up.
function isRateLimitHit(e: unknown): boolean {
  return typeof (e as { msBeforeNext?: number }).msBeforeNext === 'number';
}

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
  } catch (e: unknown) {
    if (!isRateLimitHit(e)) { next(); return; } // Redis down - fail open
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
    if (!isRateLimitHit(e)) { next(); return; } // Redis down - fail open

    const ms = (e as { msBeforeNext?: number }).msBeforeNext ?? 60000;

    // Count this rejection toward the abuse threshold.
    // Fire-and-forget - never block the 429 response on DB/Redis ops.
    apiKeyAbuseTracker.consume(req.apiKey.id).catch(async (abuseErr: unknown) => {
      if ((abuseErr as { remainingPoints?: number }).remainingPoints !== undefined) {
        // remainingPoints reached 0 → threshold exceeded → auto-suspend
        const keyId = req.apiKey!.id;
        logger.error('API key auto-suspended due to rate-limit abuse', { keyId });
        await query(
          `UPDATE api_keys SET is_active = false WHERE id = $1 AND is_active = true`,
          [keyId]
        ).catch((dbErr: unknown) => {
          logger.error('Failed to auto-suspend abusive API key', { keyId, error: (dbErr as Error).message });
        });
      }
    });

    res.status(429).json({
      error: 'rate_limit_exceeded',
      message: 'API rate limit: 1000 req/min',
      retry_after: Math.ceil(ms / 1000),
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
    if (!isRateLimitHit(e)) { next(); return; } // Redis down - fail open
    const ms = (e as { msBeforeNext?: number }).msBeforeNext ?? 60000;
    res.status(429).json({
      error: 'rate_limit_exceeded',
      message: 'Too many requests from this IP.',
      retry_after: Math.ceil(ms / 1000)
    });
  }
}
