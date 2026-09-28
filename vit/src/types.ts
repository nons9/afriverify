export type VerificationLevel = 'basic' | 'standard' | 'enhanced';
export type TrustLevel = 'low' | 'medium' | 'high' | 'very_high';

export interface VitClaims {
  /** AfriVerify identity ID */
  sub: string;
  /** Token issuer — always `https://api.afriverify.sankofaapp.com` */
  iss: string;
  /** Intended audience (your platform ID) */
  aud: string | string[];
  /** Expiry as Unix timestamp */
  exp: number;
  /** Issued-at as Unix timestamp */
  iat: number;
  /** Unique JWT ID (use to prevent replay) */
  jti: string;
  /** Highest level of identity verification completed */
  verification_level: VerificationLevel;
  /** Trust score 0–1000 (higher = more trustworthy history) */
  trust_score: number;
  /** Human-readable trust band */
  trust_level: TrustLevel;
  /** ISO 3166-1 alpha-2 country code of the verified identity */
  country_code: string;
  /** Which identity documents / signals were verified */
  id_types_verified: string[];
}

export interface VerifyVitOptions {
  /** Your platform's audience string. If set, the `aud` claim must match. */
  audience?: string;
  /** Expected issuer. Defaults to AfriVerify production. */
  issuer?: string;
  /** Clock skew tolerance in seconds (default: 60). */
  leeway?: number;
  /** Override JWKS URI (sandbox: `https://api.afriverify.sankofaapp.com/sandbox/v1/.well-known/jwks.json`) */
  jwksUri?: string;
  /** JWKS cache TTL in milliseconds (default: 10 minutes). */
  cacheMaxAge?: number;
}

export type VerifyVitResult =
  | { valid: true; claims: VitClaims }
  | { valid: false; error: string };
