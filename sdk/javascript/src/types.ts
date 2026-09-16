// ─── Shared ──────────────────────────────────────────────────────────────────

export type OtpChannel = 'sms' | 'email';
export type Lang = 'en' | 'fr';

export type SessionStatus =
  | 'pending'
  | 'otp_sent'
  | 'otp_verified'
  | 'id_uploaded'
  | 'face_submitted'
  | 'completed'
  | 'failed'
  | 'expired';

export type VerificationResult = 'pass' | 'fail' | 'review' | null;

// ─── Verify resource ──────────────────────────────────────────────────────────

export interface InitiateParams {
  phone: string;
  email?: string;
  otp_channel?: OtpChannel;
  platform_user_id?: string;
  redirect_url?: string;
  flow_id?: string;
  lang?: Lang;
}

export interface InitiateResponse {
  session_token: string;
  expires_at: string;
  otp_channel: OtpChannel;
}

export interface SendOtpParams {
  session_token: string;
}

export interface SendOtpResponse {
  sent: boolean;
  otp_channel: OtpChannel;
}

export interface ConfirmOtpParams {
  session_token: string;
  code: string;
}

export interface ConfirmOtpResponse {
  verified: boolean;
  next_step: 'id_upload' | 'face' | 'complete';
}

export interface UploadIdParams {
  session_token: string;
  /** Front-side image as Buffer, Blob, or base64-encoded string */
  front: Buffer | Blob | string;
  /** Back-side image (optional) */
  back?: Buffer | Blob | string;
}

export interface UploadIdResponse {
  uploaded: boolean;
  next_step: 'face' | 'complete';
}

export interface SubmitFaceParams {
  session_token: string;
  /** Selfie image as Buffer, Blob, or base64-encoded string */
  selfie: Buffer | Blob | string;
}

export interface SubmitFaceResponse {
  submitted: boolean;
  result: VerificationResult;
  trust_score?: number;
}

export interface SessionStatusResponse {
  session_token: string;
  status: SessionStatus;
  result: VerificationResult;
  trust_score?: number;
  identity_id?: string;
  completed_at?: string;
}

// ─── Identity resource ────────────────────────────────────────────────────────

export interface IdentityCheckParams {
  phone?: string;
  email?: string;
  identity_id?: string;
}

export interface IdentityCheckResponse {
  found: boolean;
  identity_id?: string;
  trust_score?: number;
  verified_at?: string;
}

export interface ConnectParams {
  session_token: string;
  platform_user_id: string;
}

export interface ConnectResponse {
  connected: boolean;
  identity_id: string;
  platform_user_id: string;
}

export interface IdentityProfile {
  identity_id: string;
  phone: string;
  email?: string;
  full_name?: string;
  trust_score: number;
  verified_at?: string;
  country_code?: string;
  id_type?: string;
  aml_status?: string;
  risk_level?: string;
}

export interface FlagIdentityParams {
  identity_id: string;
  reason: string;
  severity?: 'low' | 'medium' | 'high';
}

export interface FlagIdentityResponse {
  flagged: boolean;
  flag_id: string;
}

export interface VouchParams {
  identity_id: string;
  note?: string;
}

export interface VouchResponse {
  vouched: boolean;
  vouch_id: string;
}

export interface Vouch {
  vouch_id: string;
  platform_name: string;
  created_at: string;
  note?: string;
}

// ─── Webhook event types ──────────────────────────────────────────────────────

export type WebhookEventType =
  | 'verification.completed'
  | 'verification.failed'
  | 'verification.expired'
  | 'identity.created'
  | 'identity.updated'
  | 'identity.flagged'
  | 'trust.updated'
  | 'aml.screened'
  | 'aml.flagged';

export interface WebhookEvent<T = unknown> {
  event: WebhookEventType;
  api_key_id: string;
  platform_user_id?: string;
  timestamp: string;
  data: T;
}

export interface VerificationCompletedData {
  session_token: string;
  identity_id: string;
  result: VerificationResult;
  trust_score: number;
  phone: string;
}

export interface TrustUpdatedData {
  identity_id: string;
  previous_score: number;
  new_score: number;
  reason: string;
}

export interface AmlScreenedData {
  identity_id: string;
  status: 'clear' | 'potential_match' | 'confirmed_match';
  checked_at: string;
}
