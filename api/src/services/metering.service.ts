import { query, queryOne } from '../db';
import redis from '../redis';
import logger from '../utils/logger';
import {
  Step, STEP_USAGE_TYPE, OTP_MAX_SENDS, meteringState, parseEffectiveAt, parsePremiumPrefixes, isPremiumPhone, targetUnits, MeteringState,
} from './metering-rules';

const v2At = () => parseEffectiveAt(process.env.METERING_V2_AT);
const premiumPrefixes = () => parsePremiumPrefixes(process.env.SMS_PREMIUM_PREFIXES);

export interface StepDecision { ok: boolean; status?: number; body?: { error: string; message: string } }

async function stateFor(apiKeyId: string): Promise<{ state: MeteringState; tier: string; environment: string }> {
  const key = await queryOne<{ tier: string; environment: string }>('SELECT tier, environment FROM api_keys WHERE id = $1', [apiKeyId]);
  const sub = await queryOne<{ current_period_start: string; current_period_end: string }>(
    `SELECT current_period_start, current_period_end FROM subscriptions
     WHERE api_key_id = $1 AND status IN ('active', 'past_due') ORDER BY current_period_end DESC LIMIT 1`,
    [apiKeyId]
  );
  const state = meteringState(
    new Date(), v2At(),
    sub ? { periodStart: new Date(sub.current_period_start), periodEnd: new Date(sub.current_period_end) } : null
  );
  return { state, tier: key?.tier ?? 'free', environment: key?.environment ?? 'production' };
}

/**
 * Called just before a paid step runs (ID vendor call, live face scan) and when a session is created.
 * Free production keys cannot run vendor-backed steps once metering v2 is on. Otherwise the session is
 * billed up to the step's units, exactly once per step, even under retries or concurrent requests.
 */
export async function chargeStep(opts: { sessionId: string; apiKeyId: string; phone: string; step: Step }): Promise<StepDecision> {
  let ctx;
  try {
    ctx = await stateFor(opts.apiKeyId);
  } catch (err) {
    // Billing lookups must never take verification down. Err on the side of letting the step run.
    logger.error('metering lookup failed', { error: (err as Error).message });
    return { ok: true };
  }
  if (ctx.state === 'off' || ctx.state === 'grandfathered') return { ok: true };

  if (opts.step !== 'phone' && ctx.tier === 'free' && ctx.environment === 'production') {
    return {
      ok: false,
      status: 402,
      body: { error: 'plan_required', message: 'ID and face verification need a paid plan on live keys. Use a sandbox key to test, or upgrade at https://afriverify.sankofaapp.com/dashboard/usage' },
    };
  }

  const target = targetUnits(opts.step, isPremiumPhone(opts.phone, premiumPrefixes()));
  try {
    const row = await queryOne<{ delta: number }>(
      `WITH prev AS (SELECT billed_units AS b FROM verification_sessions WHERE id = $1 FOR UPDATE)
       UPDATE verification_sessions s SET billed_units = $2 FROM prev
       WHERE s.id = $1 AND prev.b < $2
       RETURNING ($2::int - prev.b) AS delta`,
      [opts.sessionId, target]
    );
    const delta = row?.delta ?? 0;
    if (delta > 0 && opts.step !== 'phone') {
      // The phone unit is already counted when the session is created; later steps add the difference.
      await query('UPDATE api_keys SET verifications_this_month = verifications_this_month + $1 WHERE id = $2', [delta, opts.apiKeyId]);
      await query(
        `INSERT INTO usage_records (api_key_id, verification_type, count, billing_period) VALUES ($1, $2, $3, $4)`,
        [opts.apiKeyId, STEP_USAGE_TYPE[opts.step], delta, new Date().toISOString().slice(0, 7)]
      );
    } else if (delta > 0 && opts.step === 'phone') {
      // Premium-SMS surcharge on top of the unit already counted at creation.
      await query('UPDATE api_keys SET verifications_this_month = verifications_this_month + $1 WHERE id = $2', [delta, opts.apiKeyId]);
      await query(
        `INSERT INTO usage_records (api_key_id, verification_type, count, billing_period) VALUES ($1, 'level1', $2, $3)`,
        [opts.apiKeyId, delta, new Date().toISOString().slice(0, 7)]
      );
    }
  } catch (err) {
    logger.error('metering charge failed', { sessionId: opts.sessionId, step: opts.step, error: (err as Error).message });
  }
  return { ok: true };
}

/** Cap OTP messages per session. Fails closed if the counter store is down, because each send costs money. */
export async function otpSendAllowed(sessionId: string): Promise<'ok' | 'limit' | 'error'> {
  try {
    const k = `otp-sends:${sessionId}`;
    const n = await redis.incr(k);
    if (n === 1) await redis.expire(k, 1800);
    return n > OTP_MAX_SENDS ? 'limit' : 'ok';
  } catch {
    return 'error';
  }
}
