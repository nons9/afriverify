import { Buffer } from 'buffer';
import logger from '../utils/logger';

// ─── Shared types ────────────────────────────────────────────────────────────

export type ProviderName = 'smile_identity' | 'dojah' | 'onfido';

export interface ProviderVerifyIdParams {
  id_type: string;
  id_number: string;
  country: string;
  first_name: string;
  last_name: string;
  dob?: string;
  phone?: string;
  middle_name?: string;
  id_photo_buffer?: Buffer; // required for Onfido document check
}

export interface ProviderBiometricParams {
  country: string;
  id_type: string;
  partner_user_id: string;
  selfie_buffer: Buffer;
  id_photo_buffer?: Buffer;
  id_number?: string;
  first_name?: string;
  last_name?: string;
}

export interface ProviderResult {
  success: boolean;
  result_code: string;
  result_text: string;
  confidence: number;
  name_match: boolean;
  dob_match: boolean;
  rejected: boolean;
  rejection_reason?: string;
  face_match_confidence?: number;
  liveness_passed?: boolean;
  provider: ProviderName;
  /** Onfido async: check submitted but not yet complete - store check_id and resolve via webhook */
  pending?: boolean;
  check_id?: string;
}

export interface IdentityProvider {
  name: ProviderName;
  supportsCountry(country: string): boolean;
  supportsIdType(idType: string, country: string): boolean;
  verifyId(params: ProviderVerifyIdParams): Promise<ProviderResult>;
  biometricKYC(params: ProviderBiometricParams): Promise<ProviderResult>;
}

/** Has the owner given us this vendor's keys? Without them we do not call it (and do not charge for a check). */
export function providerConfigured(name: ProviderName): boolean {
  const e = process.env;
  if (name === 'smile_identity') return !!(e.SMILE_IDENTITY_PARTNER_ID && e.SMILE_IDENTITY_API_KEY);
  if (name === 'dojah') return !!(e.DOJAH_APP_ID && e.DOJAH_SECRET_KEY);
  return !!e.ONFIDO_API_TOKEN;
}

export class NoProviderConfigured extends Error {
  constructor() { super('no_identity_provider_configured'); }
}

// ─── Provider registry (lazy-loaded to avoid circular imports) ───────────────

let _smile: IdentityProvider | undefined;
let _dojah: IdentityProvider | undefined;
let _onfido: IdentityProvider | undefined;

function getProvider(name: ProviderName): IdentityProvider {
  if (name === 'smile_identity') {
    if (!_smile) _smile = require('./providers/smile-identity.provider').smileIdentityProvider;
    return _smile!;
  }
  if (name === 'dojah') {
    if (!_dojah) _dojah = require('./providers/dojah.provider').dojahProvider;
    return _dojah!;
  }
  if (!_onfido) _onfido = require('./providers/onfido.provider').onfidoProvider;
  return _onfido!;
}

// ─── Routing table ───────────────────────────────────────────────────────────
// Each rule is evaluated in order; first match wins.
// primary: try first.  fallback: try if primary throws (not if it returns rejected).

interface RoutingRule {
  countries?: string[];
  id_types?: string[];
  primary: ProviderName;
  fallback: ProviderName;
}

const ROUTING_TABLE: RoutingRule[] = [
  // Nigeria BVN/NIN → Dojah first (cheapest and most reliable for these)
  {
    countries: ['NG'],
    id_types: ['BVN', 'NIN'],
    primary: 'dojah',
    fallback: 'smile_identity'
  },
  // North Africa → Onfido first (better registry coverage)
  {
    countries: ['MA', 'EG', 'TN', 'DZ', 'LY', 'SD'],
    primary: 'onfido',
    fallback: 'smile_identity'
  },
  // Default: Smile Identity for all other countries/types
  {
    primary: 'smile_identity',
    fallback: 'smile_identity'
  }
];

function selectProviders(
  country: string,
  idType: string,
  preferred?: ProviderName | null
): { primary: IdentityProvider; fallback: IdentityProvider } {
  if (preferred) {
    const p = getProvider(preferred);
    return { primary: p, fallback: getProvider('smile_identity') };
  }

  const c = country.toUpperCase();
  const t = idType.toUpperCase();

  for (const rule of ROUTING_TABLE) {
    const countryMatch = !rule.countries || rule.countries.includes(c);
    const typeMatch = !rule.id_types || rule.id_types.includes(t);
    if (countryMatch && typeMatch) {
      return {
        primary: getProvider(rule.primary),
        fallback: getProvider(rule.fallback)
      };
    }
  }

  // Should never reach here due to catch-all rule
  return {
    primary: getProvider('smile_identity'),
    fallback: getProvider('smile_identity')
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function verifyId(
  params: ProviderVerifyIdParams,
  preferred?: ProviderName | null
): Promise<ProviderResult> {
  const chosen = selectProviders(params.country, params.id_type, preferred);
  // Skip any vendor we hold no keys for. If neither is usable there is no registry check to run.
  const usable = [chosen.primary, chosen.fallback].filter((p, i, a) => providerConfigured(p.name) && a.findIndex((q) => q.name === p.name) === i);
  if (usable.length === 0) throw new NoProviderConfigured();
  const primary = usable[0];
  const fallback = usable[1] ?? usable[0];
  const useFallback = primary.name !== fallback.name;

  logger.info('Identity verification routing', {
    country: params.country,
    id_type: params.id_type,
    preferred: preferred ?? 'auto',
    provider: primary.name
  });

  try {
    return await primary.verifyId(params);
  } catch (err) {
    if (!useFallback) throw err;

    logger.warn(`${primary.name} verifyId failed, falling back to ${fallback.name}`, {
      error: (err as Error).message,
      country: params.country,
      id_type: params.id_type
    });

    return fallback.verifyId(params);
  }
}

export async function biometricKYC(
  params: ProviderBiometricParams,
  preferred?: ProviderName | null
): Promise<ProviderResult> {
  const { primary, fallback } = selectProviders(params.country, params.id_type, preferred);
  const useFallback = primary.name !== fallback.name;

  logger.info('Biometric KYC routing', {
    country: params.country,
    id_type: params.id_type,
    preferred: preferred ?? 'auto',
    provider: primary.name
  });

  try {
    return await primary.biometricKYC(params);
  } catch (err) {
    if (!useFallback) throw err;

    logger.warn(`${primary.name} biometricKYC failed, falling back to ${fallback.name}`, {
      error: (err as Error).message,
      country: params.country,
      id_type: params.id_type
    });

    return fallback.biometricKYC(params);
  }
}

export function routingTableSummary(): Array<{
  countries: string;
  id_types: string;
  primary: ProviderName;
  fallback: ProviderName;
}> {
  return ROUTING_TABLE.map((r) => ({
    countries: r.countries?.join(', ') ?? 'all',
    id_types: r.id_types?.join(', ') ?? 'all',
    primary: r.primary,
    fallback: r.fallback
  }));
}
