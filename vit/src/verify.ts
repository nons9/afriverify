import { importKey } from './jwks.js';
import type { VitClaims, VerifyVitOptions, VerifyVitResult } from './types.js';

const DEFAULT_ISSUER = 'https://api.afriverify.sankofaapp.com';
const DEFAULT_JWKS_URI = 'https://api.afriverify.sankofaapp.com/.well-known/jwks.json';
const DEFAULT_LEEWAY = 60;
const DEFAULT_CACHE_MAX_AGE = 10 * 60 * 1000;

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + ((4 - (s.length % 4)) % 4), '=');
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function verifyVit(token: string, options: VerifyVitOptions = {}): Promise<VerifyVitResult> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false, error: 'Malformed JWT: expected 3 parts' };

    const [headerB64, payloadB64, sigB64] = parts;

    let header: { alg?: string; kid?: string };
    let claims: VitClaims;
    try {
      header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerB64)));
      claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
    } catch {
      return { valid: false, error: 'Malformed JWT: could not parse header or payload' };
    }

    const alg = header.alg;
    const kid = header.kid;
    if (!alg) return { valid: false, error: 'JWT header missing alg' };
    if (!kid) return { valid: false, error: 'JWT header missing kid' };
    if (alg !== 'RS256' && alg !== 'ES256') return { valid: false, error: `Unsupported algorithm: ${alg}` };

    const jwksUri = options.jwksUri ?? DEFAULT_JWKS_URI;
    const cacheMaxAge = options.cacheMaxAge ?? DEFAULT_CACHE_MAX_AGE;

    const key = await importKey(kid, alg, jwksUri, cacheMaxAge);

    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = b64urlToBytes(sigB64);

    const cryptoAlg =
      alg === 'RS256'
        ? ({ name: 'RSASSA-PKCS1-v1_5' } as AlgorithmIdentifier)
        : ({ name: 'ECDSA', hash: 'SHA-256' } as EcdsaParams);

    const signatureValid = await crypto.subtle.verify(cryptoAlg, key, signature.buffer as ArrayBuffer, signingInput);
    if (!signatureValid) return { valid: false, error: 'Invalid signature' };

    const now = Math.floor(Date.now() / 1000);
    const leeway = options.leeway ?? DEFAULT_LEEWAY;

    if (typeof claims.exp !== 'number') return { valid: false, error: 'Missing exp claim' };
    if (claims.exp + leeway < now) return { valid: false, error: 'Token expired' };

    const expectedIssuer = options.issuer ?? DEFAULT_ISSUER;
    if (claims.iss !== expectedIssuer) return { valid: false, error: `Invalid issuer: "${claims.iss}"` };

    if (options.audience) {
      const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (!aud.includes(options.audience)) return { valid: false, error: 'Invalid audience' };
    }

    if (!claims.verification_level) return { valid: false, error: 'Missing verification_level claim' };
    if (typeof claims.trust_score !== 'number') return { valid: false, error: 'Missing trust_score claim' };
    if (!claims.country_code) return { valid: false, error: 'Missing country_code claim' };

    return { valid: true, claims };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}
