interface JwksKey {
  kty: string;
  use?: string;
  kid: string;
  alg?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
}

interface JwksCache {
  keys: JwksKey[];
  fetchedAt: number;
}

const cache = new Map<string, JwksCache>();

async function fetchJwks(uri: string, maxAge: number): Promise<JwksKey[]> {
  const cached = cache.get(uri);
  if (cached && Date.now() - cached.fetchedAt < maxAge) {
    return cached.keys;
  }

  const res = await fetch(uri);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status} ${res.statusText}`);

  const jwks = (await res.json()) as { keys: JwksKey[] };
  if (!Array.isArray(jwks.keys)) throw new Error('Invalid JWKS response');

  cache.set(uri, { keys: jwks.keys, fetchedAt: Date.now() });
  return jwks.keys;
}

export async function importKey(
  kid: string,
  alg: string,
  jwksUri: string,
  cacheMaxAge: number
): Promise<CryptoKey> {
  const keys = await fetchJwks(jwksUri, cacheMaxAge);
  const jwk = keys.find((k) => k.kid === kid);
  if (!jwk) throw new Error(`No JWKS key found for kid="${kid}"`);

  if (alg === 'RS256') {
    return crypto.subtle.importKey(
      'jwk',
      jwk as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
  }

  if (alg === 'ES256') {
    return crypto.subtle.importKey(
      'jwk',
      jwk as JsonWebKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
  }

  throw new Error(`Unsupported JWT algorithm: ${alg}`);
}
