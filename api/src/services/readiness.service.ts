import pool from '../db';
import redis from '../redis';
import { getMigrationStatus } from '../db/migration-status';

export interface Readiness { ok: boolean; checks: Record<string, unknown> }

/** Is this instance fit to serve? Database, Redis, and every shipped migration applied. Used by the release gate and the status page. */
export async function getReadiness(): Promise<Readiness> {
  const checks: Record<string, unknown> = {};
  let ok = true;
  try { await pool.query('SELECT 1'); checks.database = 'ok'; } catch { checks.database = 'down'; ok = false; }
  try {
    checks.redis = (await redis.ping()) === 'PONG' ? 'ok' : 'down';
    if (checks.redis !== 'ok') ok = false;
  } catch { checks.redis = 'down'; ok = false; }
  try {
    const m = await getMigrationStatus();
    checks.migrations = m.current ? 'current' : { pending: m.pending };
    if (!m.current) ok = false;
  } catch { checks.migrations = 'unknown'; ok = false; }
  return { ok, checks };
}
