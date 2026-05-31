import { query, queryOne } from '../db';
import { sha256 } from '../utils/crypto';
import logger from '../utils/logger';

export interface BlacklistCheckParams {
  phone?: string;
  device_id?: string;
  id_number?: string;
  face_hash?: string;
}

export interface BlacklistResult {
  blacklisted: boolean;
  reason?: string;
  scope?: string;
}

export async function checkBlacklist(
  params: BlacklistCheckParams
): Promise<BlacklistResult> {
  const checks: Array<{ type: string; value: string }> = [];

  if (params.phone) checks.push({ type: 'phone', value: sha256(params.phone) });
  if (params.device_id) checks.push({ type: 'device_id', value: sha256(params.device_id) });
  if (params.id_number) checks.push({ type: 'id_number_hash', value: sha256(params.id_number) });
  if (params.face_hash) checks.push({ type: 'face_hash', value: params.face_hash });

  for (const check of checks) {
    const entry = await queryOne<{ reason: string; scope: string }>(
      'SELECT reason, scope FROM blacklist WHERE type = $1 AND value = $2',
      [check.type, check.value]
    );
    if (entry) {
      logger.warn('Blacklist hit', { type: check.type, scope: entry.scope });
      return { blacklisted: true, reason: entry.reason, scope: entry.scope };
    }
  }

  return { blacklisted: false };
}

export async function addToBlacklist(params: {
  identity_id?: string;
  type: 'face_hash' | 'device_id' | 'phone' | 'ip_range' | 'id_number_hash';
  value: string;
  reason: string;
  scope: 'platform' | 'global';
  reported_by_platform?: string;
  added_by: string;
}): Promise<void> {
  const hashed = sha256(params.value);

  await query(
    `INSERT INTO blacklist (identity_id, type, value, reason, scope, reported_by_platform, confirmed_at, added_by)
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7)
     ON CONFLICT DO NOTHING`,
    [
      params.identity_id ?? null,
      params.type,
      hashed,
      params.reason,
      params.scope,
      params.reported_by_platform ?? null,
      params.added_by
    ]
  );

  if (params.identity_id) {
    await query(
      `UPDATE verified_identities
       SET is_blacklisted = true, blacklist_reason = $1, blacklist_scope = $2, updated_at = NOW()
       WHERE id = $3`,
      [params.reason, params.scope, params.identity_id]
    );
  }
}
