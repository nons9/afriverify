import { query, queryOne } from '../db';
import { screenName } from './screening.service';
import { pushKybUpdate } from './platform-webhook.service';
import { KybEntity, KybRegistrationType } from '../types';
import logger from '../utils/logger';

// A director's individual KYC must have cleared biometric verification
// (level 2), not just phone/OTP, before they count toward a business's KYB -
// a phone number alone proves nothing about who actually runs the business.
const MIN_DIRECTOR_VERIFICATION_LEVEL = 2;

export async function registerKybEntity(params: {
  apiKeyId: string;
  businessName: string;
  registrationNumber: string;
  registrationCountry: string;
  registrationType: KybRegistrationType;
  businessAddress?: Record<string, unknown>;
}): Promise<KybEntity> {
  const rows = await query<KybEntity>(
    `INSERT INTO kyb_entities
       (business_name, registration_number, registration_country, registration_type, business_address, api_key_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      params.businessName,
      params.registrationNumber,
      params.registrationCountry.toUpperCase(),
      params.registrationType,
      params.businessAddress ? JSON.stringify(params.businessAddress) : null,
      params.apiKeyId
    ]
  );
  return rows[0];
}

export async function getKybEntity(kybEntityId: string, apiKeyId: string): Promise<KybEntity | null> {
  return queryOne<KybEntity>(`SELECT * FROM kyb_entities WHERE id = $1 AND api_key_id = $2`, [kybEntityId, apiKeyId]);
}

export async function attachDocument(kybEntityId: string, apiKeyId: string, s3Key: string): Promise<KybEntity | null> {
  const rows = await query<KybEntity>(
    `UPDATE kyb_entities SET document_s3_key = $1 WHERE id = $2 AND api_key_id = $3 RETURNING *`,
    [s3Key, kybEntityId, apiKeyId]
  );
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
    await pushKybUpdate(entity.api_key_id, kybEntityId, 'rejected', reason);
    return;
  }

  await query(
    `UPDATE kyb_entities
     SET verification_status = 'verified', verification_level = 1, trust_score = 150, verified_at = NOW()
     WHERE id = $1`,
    [kybEntityId]
  );
  await pushKybUpdate(entity.api_key_id, kybEntityId, 'verified');
}
