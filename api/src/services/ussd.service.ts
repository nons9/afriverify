import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db';
import { checkBlacklist } from './blacklist.service';
import { recordUsage } from './billing.service';
import { createOrUpdatePlatformConnection } from './platform-webhook.service';
import logger from '../utils/logger';

interface ApiKeyRow {
  id: string;
  tier: string;
  verifications_this_month: number;
  monthly_limit: number;
}

export async function resolveApiKeyByServiceCode(serviceCode: string): Promise<ApiKeyRow | null> {
  return queryOne<ApiKeyRow>(
    `SELECT id, tier, verifications_this_month, monthly_limit FROM api_keys
     WHERE ussd_service_code = $1 AND is_active = true`,
    [serviceCode]
  );
}

const LEVEL_LABELS: Record<number, string> = {
  0: 'not verified',
  1: 'Level 1 (phone-verified)',
  2: 'Level 2 (fully verified, biometric)'
};

/**
 * Normalizes a phone number the way USSD aggregators deliver it (usually
 * already E.164, e.g. "+2348012345678") against however it may have been
 * stored by the app flow - both paths should resolve to the same identity
 * for the same real phone number.
 */
function normalizePhone(phone: string): string {
  return phone.startsWith('+') ? phone : `+${phone}`;
}

export async function handleCheckStatus(phone: string): Promise<string> {
  const identity = await queryOne<{ verification_level: number; trust_level: string }>(
    `SELECT verification_level, trust_level FROM verified_identities WHERE phone = $1`,
    [normalizePhone(phone)]
  );

  if (!identity) {
    return 'END This number is not verified with AfriVerify yet. Dial back and choose "Verify my phone number" to get started.';
  }

  return `END Status: ${LEVEL_LABELS[identity.verification_level] ?? 'verified'}. Trust level: ${identity.trust_level}.`;
}

export async function handleVerify(phone: string, apiKey: ApiKeyRow): Promise<string> {
  const normalizedPhone = normalizePhone(phone);

  if (apiKey.tier === 'free' && apiKey.verifications_this_month >= apiKey.monthly_limit) {
    return 'END AfriVerify is temporarily unavailable for this service. Please try again later.';
  }

  const bl = await checkBlacklist({ phone: normalizedPhone });
  if (bl.blacklisted && bl.scope === 'global') {
    return 'END This number is not eligible for verification.';
  }

  const existing = await queryOne<{ id: string; verification_level: number }>(
    `SELECT id, verification_level FROM verified_identities WHERE phone = $1`,
    [normalizedPhone]
  );

  let identityId: string;
  if (existing) {
    identityId = existing.id;
    if (existing.verification_level >= 1) {
      await createOrUpdatePlatformConnection(identityId, apiKey.id, normalizedPhone);
      return 'END This number is already AfriVerify-verified. No further action needed.';
    }
  } else {
    identityId = uuidv4();
    // Same starting values as the app flow's phone-only tier (verify.ts) -
    // a USSD session dialed from a specific SIM is itself proof of phone
    // possession, so this reaches the same level 1 an OTP confirms there,
    // without needing an OTP round-trip at all.
    await query(
      `INSERT INTO verified_identities (id, phone, verification_level, trust_score, trust_level)
       VALUES ($1, $2, 1, 50, 'new')`,
      [identityId, normalizedPhone]
    );
  }

  await createOrUpdatePlatformConnection(identityId, apiKey.id, normalizedPhone);
  await query('UPDATE api_keys SET verifications_this_month = verifications_this_month + 1 WHERE id = $1', [apiKey.id]);
  await recordUsage(apiKey.id, 'level1');

  logger.info('USSD verification completed', { identityId, apiKeyId: apiKey.id });

  return 'END Your phone number is now verified with AfriVerify (Level 1). Complete full verification on the platform app or with an agent for higher limits.';
}
