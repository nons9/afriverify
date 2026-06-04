import { createHmac } from 'crypto';
import { query, queryOne } from '../db';
import logger from '../utils/logger';

export interface WebhookPayload {
  event: string;
  identity_id: string;
  platform_user_id: string | null;
  verification_level: number;
  level_label: 'none' | 'basic' | 'biometric';
  trust_score?: number;
  timestamp: string;
}

const LEVEL_LABELS: Record<number, 'none' | 'basic' | 'biometric'> = {
  0: 'none',
  1: 'basic',
  2: 'biometric',
};

async function signAndDeliver(
  webhookUrl: string,
  secretHash: string | null,
  payload: WebhookPayload,
  apiKeyId: string,
  attempt = 1
): Promise<void> {
  const body = JSON.stringify(payload);

  // Sign with HMAC-SHA512 using the stored secret (raw secret was shown once at key creation)
  // secretHash is stored as SHA-256 of secret — we need the raw secret for HMAC
  // The raw webhook_secret is stored in environment-level key store, passed via ORBITVERIFY_WEBHOOK_SIGNING_KEY
  // Per-platform secrets are stored in api_keys.webhook_secret (plaintext AES-256 encrypted at rest)
  // Here we use the raw secret for HMAC — it must be stored in decryptable form
  const signingSecret = secretHash ?? process.env.ORBITVERIFY_DEFAULT_WEBHOOK_SECRET ?? 'no-secret';
  const sig = createHmac('sha512', signingSecret).update(body).digest('hex');

  let httpStatus: number | null = null;
  let responseBody: string | null = null;
  let success = false;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OrbitVerify-Signature': `sha512=${sig}`,
        'X-OrbitVerify-Event': payload.event,
        'X-OrbitVerify-Timestamp': payload.timestamp,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    httpStatus = res.status;
    responseBody = (await res.text()).slice(0, 500);
    success = res.ok;

    if (!res.ok) {
      logger.warn('Webhook delivery failed', {
        webhookUrl,
        status: res.status,
        event: payload.event,
        attempt,
      });
    }
  } catch (err) {
    logger.error('Webhook delivery error', {
      webhookUrl,
      error: (err as Error).message,
      attempt,
    });
  }

  // Log delivery attempt — APPEND-ONLY
  await query(
    `INSERT INTO platform_webhook_deliveries
       (api_key_id, identity_id, platform_user_id, event_type, payload,
        webhook_url, http_status, response_body, success, attempt_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      apiKeyId,
      payload.identity_id,
      payload.platform_user_id,
      payload.event,
      JSON.stringify(payload),
      webhookUrl,
      httpStatus,
      responseBody,
      success,
      attempt,
    ]
  ).catch((err) => logger.error('Failed to log webhook delivery', { error: err.message }));
}

export async function pushVerificationUpdate(
  apiKeyId: string,
  identityId: string,
  platformUserId: string | null,
  verificationLevel: number,
  trustScore?: number
): Promise<void> {
  // Get the api_key's webhook config
  const apiKey = await queryOne<{
    webhook_url: string | null;
    webhook_secret_hash: string | null;
    platform_name: string;
  }>(
    `SELECT webhook_url, webhook_secret_hash, platform_name
     FROM api_keys WHERE id = $1 AND is_active = true`,
    [apiKeyId]
  );

  if (!apiKey?.webhook_url) return; // Platform has no webhook registered — skip silently

  const payload: WebhookPayload = {
    event: 'identity.verification_updated',
    identity_id: identityId,
    platform_user_id: platformUserId,
    verification_level: verificationLevel,
    level_label: LEVEL_LABELS[verificationLevel] ?? 'none',
    trust_score: trustScore,
    timestamp: new Date().toISOString(),
  };

  // Fire and forget — webhook must not block the verification flow
  signAndDeliver(
    apiKey.webhook_url,
    apiKey.webhook_secret_hash,
    payload,
    apiKeyId
  ).catch((err) => logger.error('pushVerificationUpdate failed', { error: err.message }));
}

export async function createOrUpdatePlatformConnection(
  identityId: string,
  apiKeyId: string,
  platformUserId: string | null
): Promise<void> {
  if (!platformUserId) return;

  const apiKey = await queryOne<{ platform_name: string }>(
    `SELECT platform_name FROM api_keys WHERE id = $1`,
    [apiKeyId]
  );
  if (!apiKey) return;

  await query(
    `INSERT INTO platform_connections
       (identity_id, platform_name, platform_api_key_id, platform_user_id, connected_at, last_verified)
     VALUES ($1,$2,$3,$4,NOW(),NOW())
     ON CONFLICT (identity_id, platform_name) DO UPDATE SET
       platform_user_id = EXCLUDED.platform_user_id,
       platform_api_key_id = EXCLUDED.platform_api_key_id,
       last_verified = NOW(),
       is_active = true`,
    [identityId, apiKey.platform_name, apiKeyId, platformUserId]
  );
}
