import Redis from 'ioredis';
import logger from './utils/logger';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  connectTimeout: 10000,
});

redis.on('error', (err) => logger.error('Redis error', { error: err.message }));
redis.on('connect', () => logger.info('Redis connected'));
redis.on('reconnecting', () => logger.warn('Redis reconnecting'));

export async function connectRedis(): Promise<void> {
  await redis.connect();
}

export default redis;
