import { query, queryOne } from '../db';
import { VerifiedIdentity, VITPayload } from '../types';
import { generateVIT, verifyVIT } from '../utils/vit';
import { sha256 } from '../utils/crypto';
import logger from '../utils/logger';

export async function issueVIT(
  identityId: string
): Promise<{ token: string; payload: VITPayload }> {
  const identity = await queryOne<VerifiedIdentity>(
    'SELECT * FROM verified_identities WHERE id = $1',
    [identityId]
  );
  if (!identity) throw new Error('Identity not found');

  const platforms = await query<{ platform_name: string }>(
    'SELECT platform_name FROM platform_connections WHERE identity_id = $1 AND is_active = true',
    [identityId]
  );

  const flags: string[] = [];
  if (identity.is_blacklisted) flags.push('blacklisted');
  if (identity.is_pep) flags.push('pep');
  if (identity.aml_status === 'flagged') flags.push('aml_flagged');

  const { token, payload } = generateVIT({
    identity_id: identityId,
    full_name: identity.full_name,
    nationality: identity.nationality,
    id_type: identity.id_type,
    verification_level: identity.verification_level,
    trust_score: identity.trust_score,
    trust_level: identity.trust_level,
    aml_clear:
      identity.aml_status === 'clear' || identity.aml_status === 'not_screened',
    is_pep: identity.is_pep,
    platforms_verified_on: platforms.map((p) => p.platform_name),
    flags
  });

  // Store so the token can later be revoked and usage tracked.
  await storeVIT(identityId, token, payload).catch((err) =>
    logger.error('Failed to store VIT', { identityId, error: (err as Error).message })
  );

  return { token, payload };
}

export async function storeVIT(
  identityId: string,
  token: string,
  payload: VITPayload
): Promise<string> {
  const hash = sha256(token);
  const prefix = token.slice(0, 12);
  const expiresAt = new Date(payload.expires_at);

  const row = await queryOne<{ id: string }>(
    `INSERT INTO verified_identity_tokens
       (token_hash, token_prefix, identity_id, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (token_hash) DO NOTHING
     RETURNING id`,
    [hash, prefix, identityId, expiresAt]
  );

  return row?.id ?? '';
}

// List active (non-revoked, non-expired) VITs for an identity.
export async function getIdentityVITs(identityId: string): Promise<{
  id: string;
  token_prefix: string;
  usage_count: number;
  last_used_at: string | null;
  last_used_by: string | null;
  expires_at: string;
  created_at: string;
}[]> {
  return query(
    `SELECT id, token_prefix, usage_count, last_used_at, last_used_by, expires_at, created_at
     FROM verified_identity_tokens
     WHERE identity_id = $1 AND is_revoked = false AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [identityId]
  );
}

export async function getVITUsageLog(vitId: string, identityId: string): Promise<{
  platform_name: string | null;
  verified_at: string;
}[]> {
  return query(
    `SELECT ul.platform_name, ul.verified_at
     FROM vit_usage_log ul
     JOIN verified_identity_tokens vit ON vit.id = ul.vit_id
     WHERE ul.vit_id = $1 AND vit.identity_id = $2
     ORDER BY ul.verified_at DESC LIMIT 50`,
    [vitId, identityId]
  );
}

// Revoke a specific VIT (identity must own it).
export async function revokeVIT(vitId: string, identityId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE verified_identity_tokens SET is_revoked = true
     WHERE id = $1 AND identity_id = $2 AND is_revoked = false
     RETURNING id`,
    [vitId, identityId]
  );
  return !!row;
}

// Revoke all VITs for an identity (called before issuing a replacement).
export async function revokeAllVITs(identityId: string): Promise<void> {
  await query(
    `UPDATE verified_identity_tokens SET is_revoked = true
     WHERE identity_id = $1 AND is_revoked = false`,
    [identityId]
  );
}

export interface VITVerifyResult {
  valid: boolean;
  error?: string;
  claims?: {
    identity_id: string;
    verified: boolean;
    verification_level: number;
    verification_method: string;
    trust_score: number;
    trust_level: string;
    nationality: string;
    id_type: string;
    aml_clear: boolean;
    is_pep: boolean;
    flags: string[];
    issued_at: string;
    expires_at: string;
    platforms_verified_on: string[];
  };
}

// Called by the developer-facing POST /v1/vit/verify.
// Validates the JWT signature, checks the DB record isn't revoked, and logs usage.
export async function verifyAndLogVIT(
  token: string,
  apiKeyId: string,
  platformName: string
): Promise<VITVerifyResult> {
  // 1. Verify the JWT signature and standard claims.
  let payload: VITPayload;
  try {
    payload = verifyVIT(token);
  } catch (err) {
    const msg = (err as Error).message ?? 'invalid';
    if (msg.includes('expired')) return { valid: false, error: 'token_expired' };
    return { valid: false, error: 'token_invalid' };
  }

  // 2. Check the DB record exists and hasn't been revoked.
  const hash = sha256(token);
  const record = await queryOne<{ id: string; is_revoked: boolean }>(
    `SELECT id, is_revoked FROM verified_identity_tokens WHERE token_hash = $1`,
    [hash]
  );

  if (!record) {
    // VIT predates the store (issued before migration 038) or was never stored.
    // Trust the JWT signature alone but don't log (no row to log against).
    logger.info('VIT verified (legacy, no DB record)', { apiKeyId });
    return { valid: true, claims: stripPII(payload) };
  }

  if (record.is_revoked) {
    return { valid: false, error: 'token_revoked' };
  }

  // 3. Log usage and increment counter.
  await query(
    `INSERT INTO vit_usage_log (vit_id, api_key_id, platform_name) VALUES ($1, $2, $3)`,
    [record.id, apiKeyId, platformName]
  );
  await query(
    `UPDATE verified_identity_tokens
     SET usage_count = usage_count + 1, last_used_at = NOW(), last_used_by = $1
     WHERE id = $2`,
    [platformName, record.id]
  );

  return { valid: true, claims: stripPII(payload) };
}

// Returns verified attributes without PII (name, DOB, exact ID number).
// Platforms get yes/no signals and aggregate scores, not raw identity data.
function stripPII(p: VITPayload & { sub?: string }) {
  return {
    identity_id: p.sub ?? '',
    verified: p.verified,
    verification_level: p.level,
    verification_method: p.verification_method,
    trust_score: p.trust_score,
    trust_level: p.trust_level,
    nationality: p.nationality,
    id_type: p.id_type,
    aml_clear: p.aml_clear,
    is_pep: p.is_pep,
    flags: p.flags,
    issued_at: p.issued_at,
    expires_at: p.expires_at,
    platforms_verified_on: p.platforms_verified_on,
  };
}
