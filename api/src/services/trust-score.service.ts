import { query, queryOne } from '../db';
import { TrustLevel, TrustEventData } from '../types';
import logger from '../utils/logger';

export function trustLevelFromScore(score: number): TrustLevel {
  if (score <= 99) return 'suspended';
  if (score <= 299) return 'new';
  if (score <= 499) return 'rising';
  if (score <= 749) return 'verified';
  if (score <= 899) return 'elite';
  return 'sovereign';
}

export async function applyTrustEvent(event: TrustEventData): Promise<{
  new_score: number;
  delta: number;
  new_level: TrustLevel;
}> {
  const identity = await queryOne<{ trust_score: number; trust_level: TrustLevel }>(
    'SELECT trust_score, trust_level FROM verified_identities WHERE id = $1 FOR UPDATE',
    [event.identity_id]
  );

  if (!identity) throw new Error(`Identity ${event.identity_id} not found`);

  let delta = event.score_delta;

  // Fraud confirmed collapses score to 0
  if (event.event_type === 'fraud_confirmed') {
    delta = -identity.trust_score;
  }

  const newScore = Math.max(0, Math.min(1000, identity.trust_score + delta));
  const newLevel = trustLevelFromScore(newScore);

  await query(
    `UPDATE verified_identities
     SET trust_score = $1, trust_level = $2, updated_at = NOW()
     WHERE id = $3`,
    [newScore, newLevel, event.identity_id]
  );

  await query(
    `INSERT INTO trust_events
       (identity_id, event_type, platform, score_delta, score_after, reference_id, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      event.identity_id,
      event.event_type,
      event.platform ?? null,
      delta,
      newScore,
      event.reference_id ?? null,
      event.notes ?? null
    ]
  );

  logger.info('Trust score updated', {
    identity_id: event.identity_id,
    event_type: event.event_type,
    delta,
    new_score: newScore,
    new_level: newLevel
  });

  return { new_score: newScore, delta, new_level: newLevel };
}

export async function getTrustHistory(
  identityId: string,
  limit = 20
): Promise<Record<string, unknown>[]> {
  return query(
    `SELECT event_type, platform, score_delta, score_after, notes, created_at
     FROM trust_events
     WHERE identity_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [identityId, limit]
  );
}
