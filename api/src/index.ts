import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pool from './db';
import { connectRedis } from './redis';
import { rateLimitGlobal } from './middleware/rateLimit';
import verifyRouter from './routes/verify';
import identityRouter from './routes/identity';
import trustRouter from './routes/trust';
import developerRouter from './routes/developer';
import logger from './utils/logger';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

// ─── Security headers ────────────────────────────────────────────────────────
app.use(helmet());
app.set('trust proxy', 1);

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`Origin ${origin} not allowed`));
    },
    credentials: true
  })
);

// ─── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Global rate limit ───────────────────────────────────────────────────────
app.use(rateLimitGlobal);

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'orbitverify-api', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', service: 'orbitverify-api' });
  }
});

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/v1/verify', verifyRouter);
app.use('/v1/identity', identityRouter);
app.use('/v1/trust', trustRouter);
app.use('/v1/developer', developerRouter);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'not_found',
    message: 'Endpoint not found. See https://docs.orbitverify.africa'
  });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  try {
    await pool.query('SELECT 1');
    logger.info('PostgreSQL connected');
  } catch (err) {
    logger.error('PostgreSQL connection failed', { error: (err as Error).message });
    process.exit(1);
  }

  try {
    await connectRedis();
  } catch (err) {
    logger.error('Redis connection failed', { error: (err as Error).message });
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info(`OrbitVerify API running on port ${PORT}`, {
      env: process.env.NODE_ENV,
      port: PORT
    });
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down`);
    server.close(async () => {
      await pool.end();
      logger.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();
