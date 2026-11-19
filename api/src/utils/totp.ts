import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Time-based one-time passwords (RFC 6238, HMAC-SHA1, 6 digits, 30 second steps), as every authenticator app
 * (Google Authenticator, Microsoft Authenticator, Authy, 1Password and others) expects. No third-party library.
 */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const STEP_SECONDS = 30;
export const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A new random 160-bit secret, base32 encoded (32 characters). */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export const stepAt = (nowMs: number) => Math.floor(nowMs / 1000 / STEP_SECONDS);

export function totp(secretB32: string, nowMs = Date.now()): string {
  return hotp(base32Decode(secretB32), stepAt(nowMs));
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Checks a code against the current step and one step either side (clock drift of about 30 seconds).
 * Returns the step that matched, or null. The caller must refuse a step it has already accepted (replay).
 */
export function verifyTotp(secretB32: string, code: string, nowMs = Date.now(), window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  let secret: Buffer;
  try {
    secret = base32Decode(secretB32);
  } catch {
    return null;
  }
  const current = stepAt(nowMs);
  let matched: number | null = null;
  // Check every step without stopping early so timing does not reveal which step matched.
  for (let w = -window; w <= window; w++) {
    if (same(hotp(secret, current + w), code) && matched === null) matched = current + w;
  }
  return matched;
}

export function otpauthUri(secretB32: string, account: string, issuer = 'AfriVerify'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// Recovery codes: 10 characters from an alphabet without look-alikes, shown as xxxxx-xxxxx. 50 bits each.
const RC_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function generateRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const bytes = randomBytes(10);
    let s = '';
    for (const b of bytes) s += RC_ALPHABET[b % RC_ALPHABET.length];
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

/** Normalises what a person typed: lower case, no spaces or dashes. Returns null when it cannot be a recovery code. */
export function normalizeRecoveryCode(input: string): string | null {
  const c = input.toLowerCase().replace(/[\s-]/g, '');
  return /^[a-z0-9]{10}$/.test(c) ? c : null;
}
