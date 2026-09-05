import { randomInt } from 'crypto';
import jwt from 'jsonwebtoken';
import { query, queryOne } from '../db';
import { sha256, timingSafeEqualHex } from '../utils/crypto';
import { sendSms } from './otp.service';
import logger from '../utils/logger';

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

export async function requestPortalLogin(phone: string): Promise<void> {
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
  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    return { ok: false, error: 'too_many_attempts' };
  }

  const valid = timingSafeEqualHex(sha256(otp), record.otp_hash);
  if (!valid) {
    await query(`UPDATE identity_login_otps SET attempts = attempts + 1 WHERE id = $1`, [record.id]);
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
