import * as Sentry from '@sentry/node';
import logger from './logger';

// Sentry is entirely optional: with no SENTRY_DSN set (local dev, or before
// a project is provisioned) every call below is a no-op, so nothing here
// changes behavior when it's absent.
let enabled = false;

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.warn('SENTRY_DSN not set, error tracking disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0
  });
  enabled = true;
  logger.info('Sentry error tracking initialized');
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
