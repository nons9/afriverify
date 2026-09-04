import crypto from 'crypto';

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function generateApiKey(env: 'sandbox' | 'production'): {
  key: string;
  hash: string;
  prefix: string;
} {
  const segment = env === 'production' ? 'live' : 'test';
  const key = `av_${segment}_${crypto.randomBytes(24).toString('hex')}`;
  return { key, hash: sha256(key), prefix: key.substring(0, 16) };
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function verifyHmacSha512(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac('sha512', secret)
    .update(payload)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex')
    );
  } catch {
    return false;
  }
}

const ALGORITHM = 'aes-256-gcm';

export function encryptBuffer(data: Buffer, keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Layout: [iv:12][authTag:16][ciphertext]
  return Buffer.concat([iv, authTag, encrypted]);
}

export function decryptBuffer(data: Buffer, keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex');
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptString(value: string, keyHex: string): string {
  return encryptBuffer(Buffer.from(value, 'utf8'), keyHex).toString('base64');
}

export function decryptString(value: string, keyHex: string): string {
  return decryptBuffer(Buffer.from(value, 'base64'), keyHex).toString('utf8');
}

// Shared master key for at-rest encryption of biometric photos (s3.ts) and
// stored secrets like webhook signing secrets (platform-webhook.service.ts).
export function getDataEncryptionKey(): string {
  const key = process.env.DATA_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error(
      'DATA_ENCRYPTION_KEY not configured (must be a 64-char hex string / 32 bytes). ' +
      'Generate one with: openssl rand -hex 32'
    );
  }
  return key;
}
