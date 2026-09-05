import { query, queryOne } from '../db';
import { screenName } from './screening.service';
import { pushKybUpdate } from './platform-webhook.service';
import { recordUsage } from './billing.service';
import { KybEntity, KybRegistrationType } from '../types';
import logger from '../utils/logger';

// A director's individual KYC must have cleared biometric verification
// (level 2), not just phone/OTP, before they count toward a business's KYB -
// a phone number alone proves nothing about who actually runs the business.
const MIN_DIRECTOR_VERIFICATION_LEVEL = 2;

async function linkPlatform(kybEntityId: string, apiKeyId: string): Promise<void> {
  const apiKey = await queryOne<{ platform_name: string }>(`SELECT platform_name FROM api_keys WHERE id = $1`, [
    apiKeyId
  ]);
  if (!apiKey) return;

  await query(
    `INSERT INTO kyb_connections (kyb_entity_id, platform_name, platform_api_key_id, connected_at, last_verified)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (kyb_entity_id, platform_api_key_id) DO UPDATE SET
       last_verified = NOW(),
       is_active     = true`,
    [kybEntityId, apiKey.platform_name, apiKeyId]
  );
}

/**
 * Registers a business for KYB, or - if a business with the same
 * registration number/country/type has already been verified by any
 * platform - links this platform to that existing entity instead of
 * re-registering it from scratch. Mirrors how verify.ts reuses an existing
 * verified_identities row by phone number rather than re-running the
 * individual verification flow for every new platform.
 */
export async function registerOrLinkKybEntity(params: {
  apiKeyId: string;
  businessName: string;
  registrationNumber: string;
  registrationCountry: string;
  registrationType: KybRegistrationType;
  businessAddress?: Record<string, unknown>;
}): Promise<{ entity: KybEntity; isNewRegistration: boolean }> {
  const country = params.registrationCountry.toUpperCase();

  const existing = await queryOne<KybEntity>(
    `SELECT * FROM kyb_entities
     WHERE registration_number = $1 AND registration_country = $2 AND registration_type = $3`,
    [params.registrationNumber, country, params.registrationType]
  );

  if (existing) {
    await linkPlatform(existing.id, params.apiKeyId);
    return { entity: existing, isNewRegistration: false };
  }

  const rows = await query<KybEntity>(
    `INSERT INTO kyb_entities
       (business_name, registration_number, registration_country, registration_type, business_address, api_key_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      params.businessName,
      params.registrationNumber,
      country,
      params.registrationType,
      params.businessAddress ? JSON.stringify(params.businessAddress) : null,
      params.apiKeyId
    ]
  );
  const entity = rows[0];
  await linkPlatform(entity.id, params.apiKeyId);
  return { entity, isNewRegistration: true };
}

async function assertConnected(kybEntityId: string, apiKeyId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM kyb_connections WHERE kyb_entity_id = $1 AND platform_api_key_id = $2 AND is_active = true`,
    [kybEntityId, apiKeyId]
  );
  return !!row;
}

export async function getKybEntity(kybEntityId: string, apiKeyId: string): Promise<KybEntity | null> {
  if (!(await assertConnected(kybEntityId, apiKeyId))) return null;
  return queryOne<KybEntity>(`SELECT * FROM kyb_entities WHERE id = $1`, [kybEntityId]);
}

export async function attachDocument(kybEntityId: string, apiKeyId: string, s3Key: string): Promise<KybEntity | null> {
  if (!(await assertConnected(kybEntityId, apiKeyId))) return null;

  const rows = await query<KybEntity>(`UPDATE kyb_entities SET document_s3_key = $1 WHERE id = $2 RETURNING *`, [
    s3Key,
    kybEntityId
  ]);
  const entity = rows[0] ?? null;
  if (entity) await tryFinalize(entity.id);
  return entity ? await getKybEntity(kybEntityId, apiKeyId) : null;
}

export async function attachDirector(
  kybEntityId: string,
  apiKeyId: string,
  verifiedIdentityId: string,
  role: string
): Promise<{ ok: true; entity: KybEntity } | { ok: false; error: string }> {
  const entity = await getKybEntity(kybEntityId, apiKeyId);
  if (!entity) return { ok: false, error: 'kyb_entity_not_found' };

  const identity = await queryOne<{ verification_level: number }>(
    `SELECT verification_level FROM verified_identities WHERE id = $1`,
    [verifiedIdentityId]
  );
  if (!identity) return { ok: false, error: 'identity_not_found' };
  if (identity.verification_level < MIN_DIRECTOR_VERIFICATION_LEVEL) {
    return { ok: false, error: 'director_not_fully_verified' };
  }

  const directors = entity.director_identity_ids ?? [];
  if (directors.some((d) => d.identity_id === verifiedIdentityId)) {
    return { ok: true, entity }; // already attached, idempotent
  }
  const updatedDirectors = [...directors, { identity_id: verifiedIdentityId, role, linked_at: new Date().toISOString() }];

  await query(`UPDATE kyb_entities SET director_identity_ids = $1::jsonb WHERE id = $2`, [
    JSON.stringify(updatedDirectors),
    kybEntityId
  ]);
  await tryFinalize(kybEntityId);

  const refreshed = await getKybEntity(kybEntityId, apiKeyId);
  return { ok: true, entity: refreshed! };
}

/**
 * Auto-decision: once a document is on file and at least one qualifying
 * director is attached, screen the business name and settle the entity as
 * verified or rejected. If screening is unavailable, the entity is left
 * pending for manual review rather than auto-verified - failing closed.
 */
async function tryFinalize(kybEntityId: string): Promise<void> {
  const entity = await queryOne<KybEntity>(`SELECT * FROM kyb_entities WHERE id = $1`, [kybEntityId]);
  if (!entity || entity.verification_status !== 'pending') return;

  const directors = entity.director_identity_ids ?? [];
  if (!entity.document_s3_key || directors.length === 0) return;

  const screening = await screenName(entity.business_name, 'business');
  if (!screening) {
    logger.warn('KYB finalize: screening unavailable, leaving pending for manual review', { kybEntityId });
    return;
  }

  await query(
    `INSERT INTO aml_screenings (kyb_entity_id, screening_type, result, match_details, screened_by)
     VALUES ($1, 'sanctions', $2, $3, 'automated')`,
    [kybEntityId, screening.result, screening.matchDetails ? JSON.stringify(screening.matchDetails) : null]
  );

  if (screening.result !== 'clear') {
    const reason = `Sanctions screening ${screening.result}`;
    await query(`UPDATE kyb_entities SET verification_status = 'rejected', rejection_reason = $1 WHERE id = $2`, [
      reason,
      kybEntityId
    ]);
    await pushKybUpdate(kybEntityId, 'rejected', reason);
    return;
  }

  await query(
    `UPDATE kyb_entities
     SET verification_status = 'verified', verification_level = 1, trust_score = 150, verified_at = NOW()
     WHERE id = $1`,
    [kybEntityId]
  );
  // Billed once, to the platform that originally registered the entity -
  // a platform that links to an already-verified entity via KYB reuse never
  // triggers this finalize path at all, so it isn't charged again.
  if (entity.api_key_id) await recordUsage(entity.api_key_id, 'kyb');
  await pushKybUpdate(kybEntityId, 'verified');
}
