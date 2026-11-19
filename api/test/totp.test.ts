import test from 'node:test';
import assert from 'node:assert/strict';
import { base32Encode, base32Decode, generateSecret, hotp, totp, verifyTotp, otpauthUri, generateRecoveryCodes, normalizeRecoveryCode, stepAt } from '../src/utils/totp';

// RFC 6238 appendix B, SHA-1 secret "12345678901234567890", 6 digits (the RFC lists 8 digits; the last 6 are the same)
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const VECTORS: [number, string][] = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
];

test('matches every RFC 6238 test vector', () => {
  for (const [t, code] of VECTORS) assert.equal(totp(RFC_SECRET, t * 1000), code, `time ${t}`);
});

test('HOTP matches RFC 4226 vectors', () => {
  const secret = Buffer.from('12345678901234567890');
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  expected.forEach((e, i) => assert.equal(hotp(secret, i), e));
});

test('base32 round-trips and rejects junk', () => {
  for (let n = 1; n < 40; n++) {
    const b = Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + n) & 255));
    assert.deepEqual(base32Decode(base32Encode(b)), b);
  }
  assert.equal(base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI');
  assert.throws(() => base32Decode('not*valid'));
  assert.equal(generateSecret().length, 32);
});

test('accepts the current code and one step of drift, refuses further', () => {
  const t = 1_700_000_000_000;
  const cur = totp(RFC_SECRET, t);
  assert.equal(verifyTotp(RFC_SECRET, cur, t), stepAt(t));
  assert.equal(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t - 30_000), t), stepAt(t) - 1);
  assert.equal(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t + 30_000), t), stepAt(t) + 1);
  assert.equal(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t - 90_000), t), null);
  assert.equal(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t + 90_000), t), null);
});

test('refuses malformed codes and bad secrets without throwing', () => {
  for (const bad of ['', '12345', '1234567', 'abcdef', '12 345', '١٢٣٤٥٦']) assert.equal(verifyTotp(RFC_SECRET, bad), null);
  assert.equal(verifyTotp('!!!', '123456'), null);
});

test('otpauth URI carries the settings authenticator apps need', () => {
  const u = otpauthUri('ABC234', 'dev@x.test');
  assert.match(u, /^otpauth:\/\/totp\/AfriVerify%3Adev%40x\.test\?secret=ABC234&issuer=AfriVerify&algorithm=SHA1&digits=6&period=30$/);
});

test('recovery codes: 10 unique, well formed, and typed input is normalised', () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) {
    assert.match(c, /^[a-z2-9]{5}-[a-z2-9]{5}$/);
    assert.equal(normalizeRecoveryCode(c.toUpperCase()), c.replace('-', ''));
    assert.equal(normalizeRecoveryCode(` ${c} `), c.replace('-', ''));
  }
  assert.equal(normalizeRecoveryCode('short'), null);
  assert.equal(normalizeRecoveryCode('abc!defghi'), null);
});
