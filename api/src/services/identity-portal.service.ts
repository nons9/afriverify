import { randomInt } from 'crypto';
import jwt from 'jsonwebtoken';
import { query, queryOne } from '../db';
import { sha256, timingSafeEqualHex } from '../utils/crypto';
import { sendSms } from './otp.service';
import logger from '../utils/logger';
import redis from '../redis';

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const MAX_CODES_PER_PHONE_PER_HOUR = 5;

/**
 * Each new code carries a fresh set of attempts, so without a cap on CODES an attacker could keep asking for new
 * ones. Also stops anyone using this endpoint to spam a victim's phone or run up our SMS bill. Counted for EVERY
 * number (registered or not) and fails closed, so it neither reveals which numbers are registered nor lets a
 * Redis outage remove the limit.
 */
async function underCodeLimit(phone: string): Promise<boolean> {
  try {
    const key = `portal:otp:send:${sha256(phone).slice(0, 24)}:${Math.floor(Date.now() / 3_600_000)}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 3700);
    return n <= MAX_CODES_PER_PHONE_PER_HOUR;
  } catch {
    return false;
  }
}

export async function requestPortalLogin(phone: string): Promise<void> {
  if (!(await underCodeLimit(phone))) {
    logger.warn('Identity portal code limit reached for a phone', { phone: phone.slice(-4) });
    return;     // same outward behaviour as success: the caller is told nothing
  }
  const identity = await queryOne<{ id: string }>(`SELECT id FROM verified_identities WHERE phone = $1`, [phone]);
  // Don't reveal whether a phone number is a registered identity - always
  // behave the same either way, only actually sending an SMS when it is.
  if (!identity) {
    logger.info('Identity portal login requested for unregistered phone', { phone: phone.slice(-4) });
    return;
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await query(
    `INSERT INTO identity_login_otps (phone, otp_hash, expires_at) VALUES ($1, $2, $3)`,
    [phone, sha256(code), new Date(Date.now() + OTP_TTL_MS)]
  );

  await sendSms(phone, `Your AfriVerify identity portal code is ${code}. Valid 5 mins. Do not share.`);
}

export async function confirmPortalLogin(
  phone: string,
  otp: string
): Promise<{ ok: true; token: string; identityId: string } | { ok: false; error: string }> {
  const record = await queryOne<{ id: string; otp_hash: string; attempts: number; expires_at: string }>(
    `SELECT id, otp_hash, attempts, expires_at FROM identity_login_otps
     WHERE phone = $1 ORDER BY created_at DESC LIMIT 1`,
    [phone]
  );

  if (!record || new Date(record.expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'otp_expired' };
  }
  // Spend an attempt BEFORE comparing, atomically. Check-then-bump let a burst of parallel guesses all see
  // "0 attempts used": this is a login to a person's verified identity, so the limit must really hold.
  const spent = await queryOne<{ attempts: number }>(
    `UPDATE identity_login_otps SET attempts = attempts + 1 WHERE id = $1 AND attempts < $2 RETURNING attempts`,
    [record.id, MAX_OTP_ATTEMPTS]
  );
  if (!spent) {
    return { ok: false, error: 'too_many_attempts' };
  }

  const valid = timingSafeEqualHex(sha256(otp), record.otp_hash);
  if (!valid) {
    return { ok: false, error: 'invalid_otp' };
  }

  const identity = await queryOne<{ id: string }>(`SELECT id FROM verified_identities WHERE phone = $1`, [phone]);
  if (!identity) return { ok: false, error: 'invalid_otp' };

  await query(`DELETE FROM identity_login_otps WHERE phone = $1`, [phone]);

  const secret = process.env.IDENTITY_SESSION_JWT_SECRET;
  if (!secret) throw new Error('IDENTITY_SESSION_JWT_SECRET not configured');
  const token = jwt.sign({ sub: identity.id, phone }, secret, { expiresIn: '30d' });

  return { ok: true, token, identityId: identity.id };
}
