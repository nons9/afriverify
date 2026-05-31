import { query, queryOne } from '../db';
import { VerifiedIdentity, VITPayload } from '../types';
import { generateVIT } from '../utils/vit';

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

  return generateVIT({
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
}
