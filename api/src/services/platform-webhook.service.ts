import { createHmac, randomUUID } from 'crypto';
import { query, queryOne } from '../db';
import { decryptString, getDataEncryptionKey } from '../utils/crypto';
import logger from '../utils/logger';
import { captureError } from '../utils/sentry';

export interface IdentityWebhookPayload {
  event: 'identity.verification_updated';
  identity_id: string;
  platform_user_id: string | null;
  verification_level: number;
  level_label: 'none' | 'basic' | 'biometric';
  trust_score?: number;
  timestamp: string;
}

export interface KybWebhookPayload {
  event: 'kyb.status_updated';
  kyb_entity_id: string;
  verification_status: 'verified' | 'rejected';
  rejection_reason?: string;
  timestamp: string;
}

export interface ConnectionRevokedWebhookPayload {
  event: 'identity.connection_revoked';
  identity_id: string;
  platform_user_id: string | null;
  timestamp: string;
}

export interface TrustScoreWebhookPayload {
  event: 'trust.score_updated';
  identity_id: string;
  platform_user_id: string | null;
  trust_score: number;
  trust_level: string;
  level_changed: boolean;
  score_delta: number;
  trust_event_type: string;
  timestamp: string;
}

export type WebhookPayload =
  | IdentityWebhookPayload
  | KybWebhookPayload
  | ConnectionRevokedWebhookPayload
  | TrustScoreWebhookPayload;

const LEVEL_LABELS: Record<number, 'none' | 'basic' | 'biometric'> = {
  0: 'none',
  1: 'basic',
  2: 'biometric',
};

// Exponential backoff delays before attempt 2 and 3 (ms)
const RETRY_DELAYS_MS = [2_000, 4_000];
const MAX_ATTEMPTS    = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attemptDelivery(
  webhookUrl: string,
  signingSecret: string,
  body: string,
  payload: WebhookPayload,
  apiKeyId: string,
  correlationId: string,
  attempt: number,
  isFinal: boolean,
): Promise<boolean> {
  const sig = createHmac('sha512', signingSecret).update(body).digest('hex');

  let httpStatus: number | null = null;
  let responseBody: string | null = null;
  let success = false;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type':            'application/json',
        'X-VerifyAfrica-Signature': `sha512=${sig}`,
        'X-VerifyAfrica-Event':     payload.event,
        'X-VerifyAfrica-Timestamp': payload.timestamp,
        'X-VerifyAfrica-Attempt':   String(attempt),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    httpStatus    = res.status;
    responseBody  = (await res.text()).slice(0, 500);
    success       = res.ok;

    if (!res.ok) {
      logger.warn('Webhook delivery failed', {
        webhookUrl, status: res.status, event: payload.event, attempt,
      });
    }
  } catch (err) {
    logger.error('Webhook delivery error', {
      webhookUrl, error: (err as Error).message, attempt,
    });
  }

  // Log every attempt — table is APPEND-ONLY, never updated or deleted
  const identityId = 'identity_id' in payload ? payload.identity_id : null;
  const platformUserId = 'platform_user_id' in payload ? payload.platform_user_id : null;

  await query(
    `INSERT INTO platform_webhook_deliveries
       (api_key_id, identity_id, platform_user_id, event_type, payload,
        webhook_url, http_status, response_body, success, attempt_number,
        correlation_id, is_final_attempt)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      apiKeyId,
      identityId,
      platformUserId,
      payload.event,
      JSON.stringify(payload),
      webhookUrl,
      httpStatus,
      responseBody,
      success,
      attempt,
      correlationId,
      isFinal,
    ]
  ).catch((err) =>
    logger.error('Failed to log webhook delivery attempt', {
      error: err.message, correlationId, attempt,
    })
  );

  return success;
}

// Secrets minted after the at-rest-encryption change are base64 AES-256-GCM;
// anything minted before that (if it ever reaches production) is raw hex.
// Try decrypting first and fall back to the raw value so neither generation
// breaks delivery.
function decryptWebhookSecret(stored: string | null): string | null {
  if (!stored) return null;
  try {
    return decryptString(stored, getDataEncryptionKey());
  } catch {
    return stored;
  }
}

async function deliverWithRetry(
  webhookUrl: string,
  secretHash: string | null,
  payload: WebhookPayload,
  apiKeyId: string,
): Promise<void> {
  const correlationId   = randomUUID();
  const signingSecret   = decryptWebhookSecret(secretHash) ?? process.env.AFRIVERIFY_DEFAULT_WEBHOOK_SECRET ?? 'no-secret';
  const body            = JSON.stringify(payload);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Wait before retries (not before the first attempt)
    if (attempt > 1) {
      const delayMs = RETRY_DELAYS_MS[attempt - 2];
      logger.info('Retrying webhook delivery', {
        correlationId, attempt, delayMs, event: payload.event,
      });
      await sleep(delayMs);
    }

    const isFinal = attempt === MAX_ATTEMPTS;
    const success = await attemptDelivery(
      webhookUrl, signingSecret, body, payload,
      apiKeyId, correlationId, attempt, isFinal,
    );

    if (success) {
      if (attempt > 1) {
        logger.info('Webhook delivered after retry', { correlationId, attempt });
      }
      return;
    }
  }

  logger.error('Webhook delivery exhausted all attempts', {
    correlationId, maxAttempts: MAX_ATTEMPTS, event: payload.event, webhookUrl,
  });
}

export async function pushVerificationUpdate(
  apiKeyId: string,
  identityId: string,
  platformUserId: string | null,
  verificationLevel: number,
  trustScore?: number
): Promise<void> {
  const apiKey = await queryOne<{
    webhook_url: string | null;
    webhook_secret_hash: string | null;
    platform_name: string;
  }>(
    `SELECT webhook_url, webhook_secret_hash, platform_name
     FROM api_keys WHERE id = $1 AND is_active = true`,
    [apiKeyId]
  );

  if (!apiKey?.webhook_url) return;

  const payload: WebhookPayload = {
    event:              'identity.verification_updated',
    identity_id:        identityId,
    platform_user_id:   platformUserId,
    verification_level: verificationLevel,
    level_label:        LEVEL_LABELS[verificationLevel] ?? 'none',
    trust_score:        trustScore,
    timestamp:          new Date().toISOString(),
  };

  // Fire and forget — retries run in background, verification flow is unblocked
  deliverWithRetry(
    apiKey.webhook_url,
    apiKey.webhook_secret_hash,
    payload,
    apiKeyId,
  ).catch((err) => {
    logger.error('deliverWithRetry threw unexpectedly', { error: err.message });
    captureError(err, { apiKeyId, event: payload.event, stage: 'webhook_delivery' });
  });
}

// Fires when the identity owner themselves revokes a platform's access from
// the identity portal - the platform should stop treating this person as
// connected/verified for their own purposes even though the underlying VIT
// and verified_identities row are untouched.
export async function pushConnectionRevoked(
  apiKeyId: string,
  identityId: string,
  platformUserId: string | null
): Promise<void> {
  const apiKey = await queryOne<{ webhook_url: string | null; webhook_secret_hash: string | null }>(
    `SELECT webhook_url, webhook_secret_hash FROM api_keys WHERE id = $1 AND is_active = true`,
    [apiKeyId]
  );

  if (!apiKey?.webhook_url) return;

  const payload: WebhookPayload = {
    event:             'identity.connection_revoked',
    identity_id:        identityId,
    platform_user_id:   platformUserId,
    timestamp:           new Date().toISOString(),
  };

  deliverWithRetry(
    apiKey.webhook_url,
    apiKey.webhook_secret_hash,
    payload,
    apiKeyId,
  ).catch((err) => {
    logger.error('deliverWithRetry threw unexpectedly', { error: err.message });
    captureError(err, { apiKeyId, event: payload.event, stage: 'webhook_delivery' });
  });
}

// The whole value of a portable trust score is that it's a shared signal:
// a lender platform connected to the same identity as a marketplace
// platform should hear about a trust change the moment it happens on
// EITHER platform, not just the one that caused it - that's what turns
// trust_score from a number one platform queries into an actual real-time
// reputation feed multiple partners can price risk against.
export async function pushTrustScoreUpdate(
  identityId: string,
  trustScore: number,
  trustLevel: string,
  levelChanged: boolean,
  scoreDelta: number,
  trustEventType: string
): Promise<void> {
  const connectedKeys = await query<{
    id: string;
    webhook_url: string | null;
    webhook_secret_hash: string | null;
    platform_user_id: string | null;
  }>(
    `SELECT ak.id, ak.webhook_url, ak.webhook_secret_hash, pc.platform_user_id
     FROM platform_connections pc
     JOIN api_keys ak ON ak.id = pc.platform_api_key_id
     WHERE pc.identity_id = $1 AND pc.is_active = true AND ak.is_active = true`,
    [identityId]
  );

  const timestamp = new Date().toISOString();

  for (const apiKey of connectedKeys) {
    if (!apiKey.webhook_url) continue;
    const payload: WebhookPayload = {
      event:            'trust.score_updated',
      identity_id:       identityId,
      platform_user_id:  apiKey.platform_user_id,
      trust_score:       trustScore,
      trust_level:       trustLevel,
      level_changed:     levelChanged,
      score_delta:       scoreDelta,
      trust_event_type:  trustEventType,
      timestamp,
    };
    deliverWithRetry(
      apiKey.webhook_url,
      apiKey.webhook_secret_hash,
      payload,
      apiKey.id,
    ).catch((err) => {
      logger.error('deliverWithRetry threw unexpectedly', { error: err.message });
      captureError(err, { apiKeyId: apiKey.id, event: payload.event, stage: 'webhook_delivery' });
    });
  }
}

// A kyb_entities row can be shared by several platforms (see kyb_connections)
// once one platform's KYB reuse links to a business already verified by
// another, so a status change has to reach every connected platform, not
// just the one that most recently touched the entity.
export async function pushKybUpdate(
  kybEntityId: string,
  verificationStatus: 'verified' | 'rejected',
  rejectionReason?: string
): Promise<void> {
  const connectedKeys = await query<{
    id: string;
    webhook_url: string | null;
    webhook_secret_hash: string | null;
  }>(
    `SELECT ak.id, ak.webhook_url, ak.webhook_secret_hash
     FROM kyb_connections kc
     JOIN api_keys ak ON ak.id = kc.platform_api_key_id
     WHERE kc.kyb_entity_id = $1 AND kc.is_active = true AND ak.is_active = true`,
    [kybEntityId]
  );

  const payload: WebhookPayload = {
    event:               'kyb.status_updated',
    kyb_entity_id:        kybEntityId,
    verification_status:  verificationStatus,
    ...(rejectionReason ? { rejection_reason: rejectionReason } : {}),
    timestamp:             new Date().toISOString(),
  };

  for (const apiKey of connectedKeys) {
    if (!apiKey.webhook_url) continue;
    deliverWithRetry(
      apiKey.webhook_url,
      apiKey.webhook_secret_hash,
      payload,
      apiKey.id,
    ).catch((err) => {
      logger.error('deliverWithRetry threw unexpectedly', { error: err.message });
      captureError(err, { apiKeyId: apiKey.id, event: payload.event, stage: 'webhook_delivery' });
    });
  }
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
       platform_user_id    = EXCLUDED.platform_user_id,
       platform_api_key_id = EXCLUDED.platform_api_key_id,
       last_verified       = NOW(),
       is_active           = true`,
    [identityId, apiKey.platform_name, apiKeyId, platformUserId]
  );
}
