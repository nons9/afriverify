import { query, queryOne, withTransaction } from '../db';
import logger from '../utils/logger';
import { feeFor } from './registry-fees';
import { usableProviders, ProviderName } from './identity-provider.service';

export type RegistryPlan =
  | { action: 'run' }                                   // a vendor will be called and the fee is reserved (or free)
  | { action: 'skip'; reason: 'no_provider' | 'unpriced' | 'no_key' }  // no vendor call, no charge
  | { action: 'blocked'; balanceCents: number; feeCents: number };   // not enough credit

/**
 * Decides what to do before a registry check, and reserves the fee. Credit is taken BEFORE the vendor is called so
 * a customer cannot run up our vendor bill beyond what they have paid for.
 */
export async function planRegistryCheck(opts: {
  sessionId: string; apiKeyId: string | null; country: string; idType: string; preferred?: ProviderName | null;
}): Promise<RegistryPlan> {
  if (!opts.apiKeyId) return { action: 'skip', reason: 'no_key' };
  if (usableProviders(opts.country, opts.idType, opts.preferred).length === 0) return { action: 'skip', reason: 'no_provider' };
  const fee = feeFor(opts.country, opts.idType);
  if (fee === null) {
    logger.warn('Registry check skipped: no price set for this country and ID type', { country: opts.country, id_type: opts.idType });
    return { action: 'skip', reason: 'unpriced' };
  }
  if (fee === 0) return { action: 'run' };

  return withTransaction(async (client) => {
    const s = await client.query(`SELECT registry_fee_state FROM verification_sessions WHERE id = $1 FOR UPDATE`, [opts.sessionId]);
    if (s.rows[0]?.registry_fee_state === 'charged') return { action: 'run' as const }; // already paid for this session
    const k = await client.query(
      `UPDATE api_keys SET registry_balance_cents = registry_balance_cents - $2
       WHERE id = $1 AND registry_balance_cents >= $2 RETURNING registry_balance_cents AS bal`,
      [opts.apiKeyId, fee]
    );
    if (k.rows.length === 0) {
      const cur = await client.query(`SELECT registry_balance_cents AS bal FROM api_keys WHERE id = $1`, [opts.apiKeyId]);
      return { action: 'blocked' as const, balanceCents: Number(cur.rows[0]?.bal ?? 0), feeCents: fee };
    }
    await client.query(
      `UPDATE verification_sessions SET registry_fee_cents = $2, registry_fee_state = 'charged' WHERE id = $1`,
      [opts.sessionId, fee]
    );
    await client.query(
      `INSERT INTO registry_ledger (api_key_id, kind, amount_cents, balance_after, session_id, country, id_type)
       VALUES ($1, 'charge', $2, $3, $4, $5, $6)`,
      [opts.apiKeyId, -fee, k.rows[0].bal, opts.sessionId, opts.country.toUpperCase(), opts.idType.toUpperCase()]
    );
    return { action: 'run' as const };
  });
}

/** Gives the fee back when the check did not run (vendor unreachable). Safe to call twice. */
export async function refundRegistryFee(sessionId: string): Promise<void> {
  try {
    await withTransaction(async (client) => {
      const s = await client.query(
        `SELECT api_key_id, registry_fee_cents AS fee, registry_fee_state AS st FROM verification_sessions WHERE id = $1 FOR UPDATE`, [sessionId]);
      const row = s.rows[0];
      if (!row || row.st !== 'charged' || !row.fee) return;
      const k = await client.query(
        `UPDATE api_keys SET registry_balance_cents = registry_balance_cents + $2 WHERE id = $1 RETURNING registry_balance_cents AS bal`,
        [row.api_key_id, row.fee]);
      await client.query(`UPDATE verification_sessions SET registry_fee_state = 'refunded' WHERE id = $1`, [sessionId]);
      await client.query(
        `INSERT INTO registry_ledger (api_key_id, kind, amount_cents, balance_after, session_id) VALUES ($1, 'refund', $2, $3, $4)`,
        [row.api_key_id, row.fee, k.rows[0].bal, sessionId]);
    });
  } catch (err) {
    logger.error('Registry fee refund failed', { sessionId, error: (err as Error).message });
  }
}

/** Adds credit for a confirmed payment. Idempotent on the payment reference. */
export async function creditTopup(opts: { apiKeyId: string; usdCents: number; reference: string }): Promise<'credited' | 'duplicate'> {
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`topup:${opts.reference}`]);
    const dup = await client.query(`SELECT 1 FROM registry_ledger WHERE kind = 'topup' AND reference = $1`, [opts.reference]);
    if (dup.rows.length) return 'duplicate' as const;
    const k = await client.query(
      `UPDATE api_keys SET registry_balance_cents = registry_balance_cents + $2 WHERE id = $1 RETURNING registry_balance_cents AS bal`,
      [opts.apiKeyId, opts.usdCents]);
    if (k.rows.length === 0) throw new Error('api key not found for top-up');
    await client.query(
      `INSERT INTO registry_ledger (api_key_id, kind, amount_cents, balance_after, reference) VALUES ($1, 'topup', $2, $3, $4)`,
      [opts.apiKeyId, opts.usdCents, k.rows[0].bal, opts.reference]);
    return 'credited' as const;
  });
}

export async function getCredit(apiKeyId: string): Promise<{ balance_cents: number; ledger: unknown[] }> {
  const bal = await queryOne<{ b: string }>(`SELECT registry_balance_cents AS b FROM api_keys WHERE id = $1`, [apiKeyId]);
  const ledger = await query(
    `SELECT kind, amount_cents::float AS amount_cents, balance_after::float AS balance_after, country, id_type, created_at
     FROM registry_ledger WHERE api_key_id = $1 ORDER BY created_at DESC LIMIT 20`, [apiKeyId]);
  return { balance_cents: Number(bal?.b ?? 0), ledger };
}
