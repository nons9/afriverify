import { Request } from 'express';
import { query } from '../db';
import { sha256 } from '../utils/crypto';
import logger from '../utils/logger';

export interface AuditOptions {
  event_type: string;
  identity_id?: string;
  result: 'passed' | 'failed' | 'flagged' | 'pending';
  score_delta?: number;
  risk_score?: number;
  metadata?: Record<string, unknown>;
}

export async function writeAuditEvent(
  req: Request,
  opts: AuditOptions
): Promise<void> {
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  const ua = req.headers['user-agent'] ?? 'unknown';

  try {
    await query(
      `INSERT INTO verification_events
         (identity_id, event_type, platform, api_key_id, result,
          score_delta, risk_score, ip_hash, device_id, user_agent_hash, geo_country, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        opts.identity_id ?? null,
        opts.event_type,
        req.platform ?? null,
        req.apiKey?.id ?? null,
        opts.result,
        opts.score_delta ?? null,
        opts.risk_score ?? null,
        sha256(ip),
        (req.headers['x-device-id'] as string) ?? null,
        sha256(ua),
        (req.headers['x-geo-country'] as string) ?? null,
        JSON.stringify(opts.metadata ?? {})
      ]
    );
  } catch (err) {
    logger.error('Audit write failed', { event_type: opts.event_type, error: (err as Error).message });
  }
}
