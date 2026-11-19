import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pool from './db';
import { connectRedis } from './redis';
import { rateLimitGlobal } from './middleware/rateLimit';
import { requestId } from './middleware/requestId';
import { requestMetrics } from './middleware/requestMetrics';
import { getMigrationStatus } from './db/migration-status';
import redis from './redis';
import authRouter from './routes/auth';
import verifyRouter from './routes/verify';
import identityRouter from './routes/identity';
import kybRouter from './routes/kyb';
import trustRouter from './routes/trust';
import developerRouter from './routes/developer';
import livenessDemoRouter from './routes/liveness-demo';
import livenessEvalRouter from './routes/liveness-eval';
import openapiRouter from './routes/openapi';
import publicInfoRouter from './routes/public-info';
import { getReadiness } from './services/readiness.service';
import { startStatusRecorder } from './services/status.service';
import billingRouter from './routes/billing';
import identityPortalRouter from './routes/identity-portal';
import ussdRouter from './routes/ussd';
import afrishieldRouter from './routes/afrishield';
import internalRouter from './routes/internal';
import sandboxRouter from './routes/sandbox';
import inquiriesRouter from './routes/inquiries';
import inquiryPublicRouter from './routes/inquiry-public';
import complianceRouter from './routes/compliance';
import adminRouter from './routes/admin';
import vitRouter from './routes/vit';
import flowsRouter from './routes/flows';
import countriesRouter from './routes/countries';
import hostedRouter from './routes/hosted';
import publicRouter from './routes/public';
import webhooksRouter from './routes/webhooks';
import logger from './utils/logger';
import { initSentry, captureError } from './utils/sentry';
import { toClientError } from './utils/http-errors';
import { startFailureRateMonitor, startHttpHealthMonitor, warnIfNoAlertChannel } from './services/alerting.service';
import { startRetentionPurge } from './services/retention.service';
import { startBillingCron } from './services/billing.service';
import { startAmlRescreenWorker } from './workers/aml-rescreen.worker';

initSentry();

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.use(requestId);
app.use(requestMetrics);

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
    credentials: true,
    exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After', 'Idempotency-Replayed', 'X-Request-Id']
  })
);

// The Resend webhook signature covers the exact bytes sent, so keep them for that one route only.
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      if ((req as Request).originalUrl?.startsWith('/webhooks/resend')) {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      }
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.get('/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'afriverify-api', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', service: 'afriverify-api' });
  }
});

// Readiness: the release gate. Railway only promotes a new deployment once this returns 200, so a build whose
// migrations did not apply (or whose database/Redis is unreachable) never replaces the version that works.
app.get('/health/ready', async (_req: Request, res: Response) => {
  const { ok, checks } = await getReadiness();
  res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'not_ready', service: 'afriverify-api', checks });
});

app.use(rateLimitGlobal);

app.use('/v1/auth', authRouter);
app.use('/v1/verify', verifyRouter);
app.use('/v1/identity', identityRouter);
app.use('/v1/kyb', kybRouter);
app.use('/v1/trust', trustRouter);
app.use('/v1/developer/liveness-demo', livenessDemoRouter);
app.use('/v1/developer/liveness-eval', livenessEvalRouter);
app.use('/v1', openapiRouter);
app.use('/v1', publicInfoRouter);
app.use('/v1/developer', developerRouter);
app.use('/v1/developer/billing', billingRouter);
app.use('/v1/identity-portal', identityPortalRouter);
app.use('/v1/ussd', ussdRouter);
app.use('/v1/afrishield', afrishieldRouter);
app.use('/v1/internal', internalRouter);
app.use('/v1/sandbox', sandboxRouter);
app.use('/v1/inquiries', inquiriesRouter);
app.use('/v1/public/inquiries', inquiryPublicRouter);
app.use('/v1/developer/compliance', complianceRouter);
app.use('/v1/admin', adminRouter);
app.use('/v1/vit', vitRouter);
app.use('/v1/developer/flows', flowsRouter);
app.use('/v1/countries', countriesRouter);
app.use('/v1/hosted', hostedRouter);
app.use('/v1/public', publicRouter);
app.use('/webhooks', webhooksRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'not_found',
    message: 'Endpoint not found. See https://afriverify.sankofaapp.com/docs'
  });
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const clientErr = toClientError(err);
  if (clientErr) {
    res.status(clientErr.status).json({ error: clientErr.error, message: clientErr.message, request_id: req.requestId });
    return;
  }
  logger.error('Unhandled error', { error: err.message, stack: err.stack, requestId: req.requestId });
  captureError(err, { requestId: req.requestId, path: req.path });
  res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred', request_id: req.requestId });
});

async function bootstrap(): Promise<void> {
  // Redis: non-fatal, rate limiting degrades gracefully if unavailable
  try {
    await connectRedis();
  } catch (err) {
    logger.warn('Redis connection failed - rate limiting degraded, retrying in background', { error: (err as Error).message });
  }

  // Bind the port BEFORE checking Postgres. Railway's healthcheck polls /health
  // immediately after the container starts; crashing before listen() means
  // the probe gets "connection refused" on every attempt and the deploy fails.
  // /health already returns 503 while Postgres is unavailable, then 200 once it
  // recovers - Railway will wait up to healthcheckTimeout seconds for the 200.
  const server = app.listen(PORT, () => {
    logger.info(`AfriVerify API running on port ${PORT}`, {
      env: process.env.NODE_ENV,
      port: PORT
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received - shutting down`);
    server.close(async () => {
      await pool.end();
      logger.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  warnIfNoAlertChannel();
  startFailureRateMonitor();
  startHttpHealthMonitor();
  startRetentionPurge();
  startStatusRecorder();
  startBillingCron();
  startAmlRescreenWorker();

  // Log Postgres connectivity without blocking or crashing.
  // /health will surface the real status on every probe.
  pool.query('SELECT 1')
    .then(() => logger.info('PostgreSQL connected'))
    .catch((err: Error) =>
      logger.error('PostgreSQL not reachable at startup - /health will report degraded until it recovers', {
        error: err.message
      })
    );
}

bootstrap();
