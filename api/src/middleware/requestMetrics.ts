import { Request, Response, NextFunction } from 'express';
import { incrMetric } from '../utils/metrics';

/** Counts every API response (and 5xx separately) in Redis so a cross-replica error-rate alert can fire. */
export function requestMetrics(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith('/health')) {
    res.on('finish', () => {
      void incrMetric('http_total');
      if (res.statusCode >= 500) void incrMetric('http_5xx');
    });
  }
  next();
}
