import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

// Lets a client-reported error ("request_id: abc123") be traced straight to
// the matching log line, and lets one call's logs be grepped out of a
// service that otherwise interleaves every concurrent request's output.
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  req.requestId = (typeof incoming === 'string' && incoming.length <= 128 ? incoming : null) ?? randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
