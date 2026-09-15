import axios from 'axios';
import redis from '../redis';
import { sha256 } from '../utils/crypto';
import logger from '../utils/logger';

const AFRIAPP_VERIFY_URL =
  process.env.AFRIAPP_VERIFY_URL ??
  'https://afriapp-backend-production.up.railway.app/api/api-keys/verify';

// Cache valid results for 5 minutes. Invalid results are not cached so a
// newly-issued key is accepted without waiting for the TTL to expire.
const CACHE_TTL_SECONDS = 300;

export type AfriAppVerifyResult =
  | { valid: true; ownerId: string; product: string }
  | { valid: false };

export async function verifyAfriAppKey(rawKey: string): Promise<AfriAppVerifyResult> {
  const cacheKey = `afriapp:verify:${sha256(rawKey)}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as AfriAppVerifyResult;
  } catch (err) {
    logger.warn('AfriApp cache read failed', { error: (err as Error).message });
  }

  let body: { valid: boolean; ownerId?: string; product?: string };
  try {
    const resp = await axios.post<typeof body>(
      AFRIAPP_VERIFY_URL,
      { key: rawKey, product: 'AFRIVERIFY' },
      { timeout: 10_000 }
    );
    body = resp.data;
  } catch (err) {
    logger.error('AfriApp verify request failed', { error: (err as Error).message });
    throw new Error('AfriApp verification service unavailable');
  }

  const result: AfriAppVerifyResult =
    body.valid && body.ownerId
      ? { valid: true, ownerId: body.ownerId, product: body.product ?? 'AFRIVERIFY' }
      : { valid: false };

  if (result.valid) {
    try {
      await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));
    } catch (err) {
      logger.warn('AfriApp cache write failed', { error: (err as Error).message });
    }
  }

  return result;
}
