import { query, queryOne, withTransaction } from '../../db';
import { applyTrustEvent } from '../trust-score.service';
import logger from '../../utils/logger';

const MIN_VOUCHER_TRUST_SCORE = 600;
const MIN_VOUCHER_LEVEL = 2;
const VOUCHES_REQUIRED = 3;
const MAX_ACTIVE_VOUCHES_PER_VOUCHER = 10;  // prevents vouching factories
const FRAUD_PENALTY = 75;

export type VouchRelationship =
  | 'personal_acquaintance'
  | 'business_partner'
  | 'family'
  | 'community_member';

export interface VouchRequest {
  voucherId: string;
  vouchedId: string;
  relationship: VouchRelationship;
  statement: string;
  platform: string;
}

export interface VouchStatus {
  eligible: boolean;
  activeVouches: number;
  required: number;
  voucherIds: string[];
}

export async function addVouch(
  req: VouchRequest
): Promise<{ vouch_id: string; upgraded: boolean }> {
  let upgraded = false;

  const vouchId = await withTransaction(async (client) => {
    // Lock the voucher row to read trust score atomically
    const voucherRes = await client.query<{
      trust_score: number;
      verification_level: number;
    }>(
      `SELECT trust_score, verification_level
       FROM verified_identities WHERE id = $1 FOR UPDATE`,
      [req.voucherId]
    );
    const voucher = voucherRes.rows[0];
    if (!voucher) throw new Error('Voucher identity not found');
    if (voucher.trust_score < MIN_VOUCHER_TRUST_SCORE) {
      throw new Error(
        `Voucher requires Trust Score >= ${MIN_VOUCHER_TRUST_SCORE}. Current: ${voucher.trust_score}`
      );
    }
    if (voucher.verification_level < MIN_VOUCHER_LEVEL) {
      throw new Error('Voucher must be at least Level 2 verified');
    }
    if (req.voucherId === req.vouchedId) throw new Error('Cannot vouch for yourself');

    // Guard: no duplicate active vouch for same pair
    const dupRes = await client.query(
      `SELECT id FROM community_vouches
       WHERE voucher_identity_id = $1 AND vouched_identity_id = $2 AND status = 'active'`,
      [req.voucherId, req.vouchedId]
    );
    if (dupRes.rows.length > 0) throw new Error('Already actively vouching for this person');

    // Guard: voucher has not exceeded max active vouches (anti-factory)
    const countRes = await client.query<{ count: string }>(
      `SELECT COUNT(*) FROM community_vouches
       WHERE voucher_identity_id = $1 AND status = 'active'`,
      [req.voucherId]
    );
    if (parseInt(countRes.rows[0].count, 10) >= MAX_ACTIVE_VOUCHES_PER_VOUCHER) {
      throw new Error(`Maximum ${MAX_ACTIVE_VOUCHES_PER_VOUCHER} active vouches reached`);
    }

    // Create the vouch
    const insertRes = await client.query<{ id: string }>(
      `INSERT INTO community_vouches
         (voucher_identity_id, vouched_identity_id, relationship,
          statement, voucher_trust_score_at_time)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [req.voucherId, req.vouchedId, req.relationship, req.statement, voucher.trust_score]
    );

    // Check if vouched person has now crossed the threshold
    const vouchCountRes = await client.query<{ count: string }>(
      `SELECT COUNT(DISTINCT voucher_identity_id) AS count
       FROM community_vouches
       WHERE vouched_identity_id = $1 AND status = 'active' AND expires_at > NOW()`,
      [req.vouchedId]
    );
    const vouchCount = parseInt(vouchCountRes.rows[0].count, 10);

    if (vouchCount >= VOUCHES_REQUIRED) {
      const vouchedRes = await client.query<{ verification_level: number }>(
        `SELECT verification_level FROM verified_identities WHERE id = $1`,
        [req.vouchedId]
      );
      // Vouch path: Level 1 → Level 2 only (does not supersede ID verification)
      if (vouchedRes.rows[0]?.verification_level === 1) {
        await client.query(
          `UPDATE verified_identities
           SET verification_level = 2,
               trust_level        = 'rising',
               metadata           = metadata || '{"vouch_verified": true}'::jsonb,
               updated_at         = NOW()
           WHERE id = $1`,
          [req.vouchedId]
        );
        upgraded = true;
      }
    }

    return insertRes.rows[0].id;
  });

  // Trust event applied outside the transaction (has its own SELECT FOR UPDATE)
  if (upgraded) {
    applyTrustEvent({
      identity_id: req.vouchedId,
      event_type: 'community_vouched',
      score_delta: 75,
      platform: req.platform,
      notes: `Community vouching threshold reached (${VOUCHES_REQUIRED} vouches)`
    }).catch((err) =>
      logger.error('CommunityVouch: trust event failed after upgrade', { error: err.message })
    );
  }

  logger.info('CommunityVouch: vouch created', {
    voucher: req.voucherId,
    vouched: req.vouchedId,
    upgraded
  });

  return { vouch_id: vouchId, upgraded };
}

export async function getVouchStatus(identityId: string): Promise<VouchStatus> {
  const rows = await query<{ voucher_identity_id: string }>(
    `SELECT voucher_identity_id
     FROM community_vouches
     WHERE vouched_identity_id = $1 AND status = 'active' AND expires_at > NOW()`,
    [identityId]
  );
  return {
    eligible: rows.length >= VOUCHES_REQUIRED,
    activeVouches: rows.length,
    required: VOUCHES_REQUIRED,
    voucherIds: rows.map((r) => r.voucher_identity_id)
  };
}

export async function applyFraudPenalties(
  fraudIdentityId: string,
  platform: string
): Promise<void> {
  const vouches = await query<{ id: string; voucher_identity_id: string }>(
    `SELECT id, voucher_identity_id FROM community_vouches
     WHERE vouched_identity_id = $1 AND status = 'active'`,
    [fraudIdentityId]
  );

  for (const vouch of vouches) {
    // Revoke vouch
    await query(
      `UPDATE community_vouches
       SET status       = 'revoked',
           revoked_at   = NOW(),
           revoke_reason = 'Vouched identity confirmed as fraudulent'
       WHERE id = $1`,
      [vouch.id]
    );

    // Record penalty
    await query(
      `INSERT INTO vouch_penalties
         (vouch_id, voucher_identity_id, reason, trust_score_penalty)
       VALUES ($1,$2,$3,$4)`,
      [
        vouch.id,
        vouch.voucher_identity_id,
        'Vouched identity confirmed as fraudulent',
        FRAUD_PENALTY
      ]
    );

    // Apply Trust Score penalty to voucher
    await applyTrustEvent({
      identity_id: vouch.voucher_identity_id,
      event_type: 'vouched_for_fraudster',
      score_delta: -FRAUD_PENALTY,
      platform,
      notes: `Vouched identity ${fraudIdentityId} confirmed as fraudulent`
    });

    logger.warn('CommunityVouch: penalty applied to voucher', {
      voucher: vouch.voucher_identity_id,
      fraudster: fraudIdentityId,
      penalty: FRAUD_PENALTY
    });
  }
}
