import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pool from './db';
import { connectRedis } from './redis';
import { rateLimitGlobal } from './middleware/rateLimit';
import { requestId } from './middleware/requestId';
import authRouter from './routes/auth';
import verifyRouter from './routes/verify';
import identityRouter from './routes/identity';
import kybRouter from './routes/kyb';
import trustRouter from './routes/trust';
import developerRouter from './routes/developer';
import billingRouter from './routes/billing';
import afrishieldRouter from './routes/afrishield';
import internalRouter from './routes/internal';
import sandboxRouter from './routes/sandbox';
import logger from './utils/logger';
import { initSentry, captureError } from './utils/sentry';
import { startFailureRateMonitor } from './services/alerting.service';
import { startRetentionPurge } from './services/retention.service';
import { startBillingCron } from './services/billing.service';

initSentry();

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.use(requestId);

app.use(helmet());
app.set('trust proxy', 1);

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

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.get('/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'afriverify-api', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', service: 'afriverify-api' });
  }
});

app.use(rateLimitGlobal);

app.use('/v1/auth', authRouter);
app.use('/v1/verify', verifyRouter);
app.use('/v1/identity', identityRouter);
app.use('/v1/kyb', kybRouter);
app.use('/v1/trust', trustRouter);
app.use('/v1/developer', developerRouter);
app.use('/v1/developer/billing', billingRouter);
app.use('/v1/afrishield', afrishieldRouter);
app.use('/v1/internal', internalRouter);
app.use('/v1/sandbox', sandboxRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'not_found',
    message: 'Endpoint not found. See https://afriverify.sankofaapp.com/docs'
  });
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack, requestId: req.requestId });
  captureError(err, { requestId: req.requestId, path: req.path });
  res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred', request_id: req.requestId });
});

async function bootstrap(): Promise<void> {
  // Redis: non-fatal, rate limiting degrades gracefully if unavailable
  try {
    await connectRedis();
  } catch (err) {
    logger.warn('Redis connection failed — rate limiting degraded, retrying in background', { error: (err as Error).message });
  }

  // Bind the port BEFORE checking Postgres. Railway's healthcheck polls /health
  // immediately after the container starts; crashing before listen() means
  // the probe gets "connection refused" on every attempt and the deploy fails.
  // /health already returns 503 while Postgres is unavailable, then 200 once it
  // recovers — Railway will wait up to healthcheckTimeout seconds for the 200.
  const server = app.listen(PORT, () => {
    logger.info(`AfriVerify API running on port ${PORT}`, {
      env: process.env.NODE_ENV,
      port: PORT
    });
  });

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

  startFailureRateMonitor();
  startRetentionPurge();
  startBillingCron();

  // Log Postgres connectivity without blocking or crashing.
  // /health will surface the real status on every probe.
  pool.query('SELECT 1')
    .then(() => logger.info('PostgreSQL connected'))
    .catch((err: Error) =>
      logger.error('PostgreSQL not reachable at startup — /health will report degraded until it recovers', {
        error: err.message
      })
    );
}

bootstrap();
