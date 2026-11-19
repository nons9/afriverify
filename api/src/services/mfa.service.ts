import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import redis from '../redis';
import { query, queryOne } from '../db';
import logger from '../utils/logger';
import { sha256, encryptString, decryptString, getDataEncryptionKey } from '../utils/crypto';
import { generateSecret, otpauthUri, verifyTotp, generateRecoveryCodes, normalizeRecoveryCode } from '../utils/totp';

/**
 * Two-step verification for dashboard accounts (TOTP authenticator apps plus single-use recovery codes).
 * Rules this service keeps:
 *  - the secret is encrypted at rest and shown only once, at setup;
 *  - a code can be used once (replay-proof) and wrong codes lock the account's second step for 15 minutes after 5;
 *  - a lock or a Redis outage refuses even a correct code (fail closed);
 *  - recovery codes are stored as hashes and each works once;
 *  - every change tells the account owner by email.
 */

export const MAX_FAILURES = 5;
export const LOCK_SECONDS = 15 * 60;
const CHALLENGE_SECONDS = 5 * 60;
const failKey = (id: string) => `mfa-fail:${id}`;

export type MfaFailure = 'locked' | 'invalid';

// ─── The short-lived pass between "password correct" and "second step done" ──────────────────────────────────
// Signed with a key derived from, but different from, the session key, so it can never be used as a session.
function challengeSecret(): string {
  const s = process.env.SESSION_JWT_SECRET;
  if (!s) throw new Error('SESSION_JWT_SECRET not configured');
  return `${s}:mfa-challenge`;
}

export function signMfaToken(developerId: string): string {
  return jwt.sign({ sub: developerId, purpose: 'mfa' }, challengeSecret(), { expiresIn: CHALLENGE_SECONDS });
}

export function verifyMfaToken(token: string): string | null {
  try {
    const p = jwt.verify(token, challengeSecret()) as { sub?: string; purpose?: string };
    return p.purpose === 'mfa' && p.sub ? p.sub : null;
  } catch {
    return null;
  }
}

// ─── Failure counter ──────────────────────────────────────────────────────────────────────────────────────────
export async function isLocked(id: string): Promise<boolean> {
  try {
    const n = Number((await redis.get(failKey(id))) ?? 0);
    return n >= MAX_FAILURES;
  } catch {
    return true; // fail closed
  }
}

async function recordFailure(id: string): Promise<void> {
  try {
    const n = await redis.incr(failKey(id));
    if (n === 1) await redis.expire(failKey(id), LOCK_SECONDS);
  } catch { /* the lock check already fails closed */ }
}

async function clearFailures(id: string): Promise<void> {
  try { await redis.del(failKey(id)); } catch { /* ignore */ }
}

// ─── Code checks ──────────────────────────────────────────────────────────────────────────────────────────────
async function loadSecret(id: string): Promise<string | null> {
  const row = await queryOne<{ mfa_secret_enc: string | null }>('SELECT mfa_secret_enc FROM developers WHERE id = $1', [id]);
  return row?.mfa_secret_enc ? decryptString(row.mfa_secret_enc, getDataEncryptionKey()) : null;
}

/** Accepts a code once: the step must be newer than the last accepted one, decided atomically in the database. */
async function acceptStep(id: string, step: number): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE developers SET mfa_last_step = $2 WHERE id = $1 AND (mfa_last_step IS NULL OR mfa_last_step < $2) RETURNING id`,
    [id, step]
  );
  return rows.length > 0;
}

async function checkTotp(id: string, code: string): Promise<boolean> {
  const secret = await loadSecret(id);
  if (!secret) return false;
  const step = verifyTotp(secret, code);
  return step !== null && (await acceptStep(id, step));
}

/** Uses up one recovery code. Returns how many remain, or null if the code is not valid. */
async function useRecoveryCode(id: string, code: string): Promise<number | null> {
  const norm = normalizeRecoveryCode(code);
  if (!norm) return null;
  const rows = await query<{ remaining: number }>(
    `UPDATE developers SET mfa_recovery_hashes = mfa_recovery_hashes - $2::text
     WHERE id = $1 AND mfa_recovery_hashes ? $2::text
     RETURNING jsonb_array_length(mfa_recovery_hashes) AS remaining`,
    [id, sha256(norm)]
  );
  return rows.length ? Number(rows[0].remaining) : null;
}

/** The second step of login, and of turning two-step verification off: an authenticator code or a recovery code. */
export async function verifyLoginCode(id: string, code: string): Promise<{ ok: true; usedRecovery: boolean; remaining?: number } | { ok: false; reason: MfaFailure }> {
  if (await isLocked(id)) return { ok: false, reason: 'locked' };
  const trimmed = code.trim();
  if (/^\d{6}$/.test(trimmed.replace(/\s/g, ''))) {
    if (await checkTotp(id, trimmed.replace(/\s/g, ''))) { await clearFailures(id); return { ok: true, usedRecovery: false }; }
  } else {
    const left = await useRecoveryCode(id, trimmed);
    if (left !== null) { await clearFailures(id); return { ok: true, usedRecovery: true, remaining: left }; }
  }
  await recordFailure(id);
  return { ok: false, reason: (await isLocked(id)) ? 'locked' : 'invalid' };
}

/** An authenticator code only (no recovery codes): used to prove possession when changing recovery codes. */
export async function verifyAuthenticatorCode(id: string, code: string): Promise<{ ok: true } | { ok: false; reason: MfaFailure }> {
  if (await isLocked(id)) return { ok: false, reason: 'locked' };
  if (await checkTotp(id, code.replace(/\s/g, ''))) { await clearFailures(id); return { ok: true }; }
  await recordFailure(id);
  return { ok: false, reason: (await isLocked(id)) ? 'locked' : 'invalid' };
}

// ─── Setup, enable, disable ───────────────────────────────────────────────────────────────────────────────────
export async function getStatus(id: string): Promise<{ enabled: boolean; enabled_at: string | null; recovery_codes_remaining: number }> {
  const row = await queryOne<{ mfa_enabled_at: string | null; n: number }>(
    `SELECT mfa_enabled_at, jsonb_array_length(mfa_recovery_hashes) AS n FROM developers WHERE id = $1`,
    [id]
  );
  return { enabled: !!row?.mfa_enabled_at, enabled_at: row?.mfa_enabled_at ?? null, recovery_codes_remaining: Number(row?.n ?? 0) };
}

/** Creates a new pending secret. Not active until confirmed with a real code from the person's authenticator. */
export async function beginSetup(id: string, email: string): Promise<{ secret: string; otpauth_uri: string } | 'already_enabled'> {
  const status = await getStatus(id);
  if (status.enabled) return 'already_enabled';
  const secret = generateSecret();
  await query('UPDATE developers SET mfa_pending_secret_enc = $2 WHERE id = $1', [id, encryptString(secret, getDataEncryptionKey())]);
  return { secret, otpauth_uri: otpauthUri(secret, email) };
}

export async function confirmSetup(id: string, code: string): Promise<{ ok: true; recovery_codes: string[] } | { ok: false; reason: MfaFailure | 'no_setup' }> {
  if (await isLocked(id)) return { ok: false, reason: 'locked' };
  const row = await queryOne<{ mfa_pending_secret_enc: string | null; mfa_enabled_at: string | null }>(
    'SELECT mfa_pending_secret_enc, mfa_enabled_at FROM developers WHERE id = $1', [id]
  );
  if (!row?.mfa_pending_secret_enc || row.mfa_enabled_at) return { ok: false, reason: 'no_setup' };
  const secret = decryptString(row.mfa_pending_secret_enc, getDataEncryptionKey());
  const step = verifyTotp(secret, code.replace(/\s/g, ''));
  if (step === null) {
    await recordFailure(id);
    return { ok: false, reason: (await isLocked(id)) ? 'locked' : 'invalid' };
  }
  const codes = generateRecoveryCodes();
  const hashes = codes.map((c) => sha256(normalizeRecoveryCode(c)!));
  const rows = await query<{ id: string }>(
    `UPDATE developers
     SET mfa_secret_enc = mfa_pending_secret_enc, mfa_pending_secret_enc = NULL, mfa_enabled_at = NOW(),
         mfa_last_step = $2, mfa_recovery_hashes = $3::jsonb
     WHERE id = $1 AND mfa_enabled_at IS NULL AND mfa_pending_secret_enc IS NOT NULL
     RETURNING id`,
    [id, step, JSON.stringify(hashes)]
  );
  if (!rows.length) return { ok: false, reason: 'no_setup' };
  await clearFailures(id);
  return { ok: true, recovery_codes: codes };
}

export async function disable(id: string): Promise<void> {
  await query(
    `UPDATE developers SET mfa_secret_enc = NULL, mfa_pending_secret_enc = NULL, mfa_enabled_at = NULL,
       mfa_last_step = NULL, mfa_recovery_hashes = '[]'::jsonb WHERE id = $1`,
    [id]
  );
}

export async function replaceRecoveryCodes(id: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await query('UPDATE developers SET mfa_recovery_hashes = $2::jsonb WHERE id = $1', [id, JSON.stringify(codes.map((c) => sha256(normalizeRecoveryCode(c)!)))]);
  return codes;
}

// ─── Telling the owner ────────────────────────────────────────────────────────────────────────────────────────
export type MfaEvent = 'enabled' | 'disabled' | 'recovery_codes_replaced' | 'recovery_code_used';

const SUBJECTS: Record<MfaEvent, string> = {
  enabled: 'Two-step verification was turned on for your AfriVerify account',
  disabled: 'Two-step verification was turned OFF for your AfriVerify account',
  recovery_codes_replaced: 'Your AfriVerify recovery codes were replaced',
  recovery_code_used: 'A recovery code was used to sign in to your AfriVerify account',
};

/** Best effort: a failed email never blocks the action, and never reveals a secret. */
export async function notifyOwner(email: string, event: MfaEvent, remaining?: number): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) { logger.warn('MFA notice not sent: email is not configured', { event }); return; }
  const extra = event === 'recovery_code_used' && remaining !== undefined ? ` You have ${remaining} recovery code${remaining === 1 ? '' : 's'} left.` : '';
  try {
    await new Resend(apiKey).emails.send({
      from, to: [email], subject: SUBJECTS[event],
      text: `${SUBJECTS[event]}.${extra}\n\nIf this was you, no action is needed. If it was not, sign in and turn two-step verification on again, change your password, and tell us at security@sankofaapp.com.`,
    });
  } catch (err) {
    logger.error('MFA notice failed', { event, error: (err as Error).message });
  }
}

