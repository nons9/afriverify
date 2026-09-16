export type IdType = 'nin' | 'bvn' | 'passport' | 'national_id' | 'huduma' | 'gid' | 'unhcr' | 'cni' | 'cin';
export type SupportedLang = 'en' | 'fr';
export type TrustLevel = 'suspended' | 'new' | 'rising' | 'verified' | 'elite' | 'sovereign';
export type AmlStatus = 'not_screened' | 'pending' | 'clear' | 'flagged' | 'blocked';
export type Environment = 'sandbox' | 'production';
export type ApiTier = 'free' | 'starter' | 'growth' | 'enterprise';
export type VerificationStep = 'phone' | 'otp' | 'id_upload' | 'face_scan' | 'processing' | 'complete' | 'failed';
export type KybRegistrationType = 'cac_ng' | 'brs_ke' | 'cipc_za' | 'cimc_gh' | 'other';
export type KybVerificationStatus = 'pending' | 'verified' | 'rejected' | 'suspended';

export interface KybDirectorLink {
  identity_id: string;
  role: string;
  linked_at: string;
}

export interface KybEntity {
  id: string;
  business_name: string;
  registration_number: string;
  registration_country: string;
  registration_type: KybRegistrationType;
  director_identity_ids: KybDirectorLink[];
  business_address: Record<string, unknown> | null;
  verification_status: KybVerificationStatus;
  verification_level: number;
  trust_score: number;
  document_s3_key: string | null;
  rejection_reason: string | null;
  // The platform that originally registered this entity. Not an ownership
  // scope any more - see kyb_connections for which platforms can access it.
  api_key_id: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KybConnection {
  id: string;
  kyb_entity_id: string;
  platform_name: string;
  platform_api_key_id: string;
  connected_at: string;
  last_verified: string | null;
  is_active: boolean;
}

export interface VerifiedIdentity {
  id: string;
  phone: string;
  full_name: string;
  nationality: string;
  id_type: IdType;
  id_number_hash: string;
  face_embedding: Buffer | null;
  voice_print: Buffer | null;
  device_fingerprints: DeviceFingerprint[];
  verification_level: number;
  trust_score: number;
  trust_level: TrustLevel;
  is_blacklisted: boolean;
  blacklist_reason: string | null;
  blacklist_scope: 'platform' | 'global' | null;
  aml_status: AmlStatus;
  is_pep: boolean;
  metadata: Record<string, unknown>;
  last_active: Date | null;
  verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ApiKey {
  id: string;
  platform_name: string;
  platform_email: string;
  api_key_hash: string;
  api_key_prefix: string;
  environment: Environment;
  tier: ApiTier;
  verifications_this_month: number;
  monthly_limit: number;
  is_active: boolean;
  last_used: Date | null;
  permissions: string[];
  webhook_url: string | null;
  webhook_secret_hash: string | null;
  created_at: Date;
}

export interface VerificationSession {
  id: string;
  session_token: string;
  phone: string;
  email: string | null;
  otp_channel: 'sms' | 'email';
  otp_hash: string | null;
  otp_attempts: number;
  otp_expires_at: Date | null;
  id_photo_s3_key: string | null;
  face_photo_s3_key: string | null;
  step: VerificationStep;
  api_key_id: string;
  identity_id: string | null;
  ip_address: string | null;
  device_id: string | null;
  flow_id: string | null;
  lang: SupportedLang;
  expires_at: Date;
  created_at: Date;
}

export interface VITPayload {
  vit: string;
  verified: boolean;
  level: number;
  name: string;
  nationality: string;
  id_type: IdType;
  verification_method: string;
  trust_score: number;
  trust_level: TrustLevel;
  issued_at: string;
  expires_at: string;
  platforms_verified_on: string[];
  flags: string[];
  aml_clear: boolean;
  is_pep: boolean;
  kyb_linked: string | null;
}

export interface TrustEventData {
  identity_id: string;
  event_type: string;
  platform?: string;
  score_delta: number;
  reference_id?: string;
  notes?: string;
}

export interface DeviceFingerprint {
  device_id: string;
  user_agent_hash: string;
  first_seen: string;
  last_seen: string;
}

export interface DeveloperSession {
  id: string;
  email: string;
  company: string;
}

export interface IdentitySession {
  identityId: string;
  phone: string;
}

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
      platform?: string;
      developer?: DeveloperSession;
      identity?: IdentitySession;
    }
  }
}
