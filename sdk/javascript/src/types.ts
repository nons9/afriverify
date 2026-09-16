// ─── Shared ──────────────────────────────────────────────────────────────────

export type OtpChannel = 'sms' | 'email';
export type Lang = 'en' | 'fr';
export type VerificationResult = 'pass' | 'fail' | 'review' | null;
export type TrustLevel = 'unverified' | 'low' | 'moderate' | 'trusted' | 'highly_trusted';
export type AmlStatus = 'clear' | 'potential_match' | 'confirmed_match' | 'blocked';
export type PlanName = 'starter' | 'growth' | 'enterprise';

export type SessionStatus =
  | 'pending'
  | 'otp_sent'
  | 'otp_verified'
  | 'id_uploaded'
  | 'face_submitted'
  | 'completed'
  | 'failed'
  | 'expired';

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

export interface SendOtpParams { session_token: string }
export interface SendOtpResponse { sent: boolean; otp_channel: OtpChannel }

export interface ConfirmOtpParams { session_token: string; code: string }
export interface ConfirmOtpResponse { verified: boolean; next_step: 'id_upload' | 'face' | 'complete' }

export interface UploadIdParams {
  session_token: string;
  front: Buffer | Blob | string;
  back?: Buffer | Blob | string;
}
export interface UploadIdResponse { uploaded: boolean; next_step: 'face' | 'complete' }

export interface SubmitFaceParams {
  session_token: string;
  selfie: Buffer | Blob | string;
}
export interface SubmitFaceResponse { submitted: boolean; result: VerificationResult; trust_score?: number }

export interface SessionStatusResponse {
  session_token: string;
  status: SessionStatus;
  result: VerificationResult;
  trust_score?: number;
  identity_id?: string;
  completed_at?: string;
}

// ─── Identity resource ────────────────────────────────────────────────────────

export interface IdentityCheckParams { phone?: string; email?: string; identity_id?: string }
export interface IdentityCheckResponse { found: boolean; identity_id?: string; trust_score?: number; verified_at?: string }

export interface ConnectParams { session_token: string; platform_user_id: string }
export interface ConnectResponse { connected: boolean; identity_id: string; platform_user_id: string }

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

export interface FlagIdentityParams { identity_id: string; reason: string; severity?: 'low' | 'medium' | 'high' }
export interface FlagIdentityResponse { flagged: boolean; flag_id: string }

export interface VouchParams { identity_id: string; note?: string }
export interface VouchResponse { vouched: boolean; vouch_id: string }

export interface Vouch {
  vouch_id: string;
  platform_name: string;
  created_at: string;
  note?: string;
}

// ─── Webhook event catalog ────────────────────────────────────────────────────

interface BaseWebhookEvent {
  schema_version: 'v1';
  timestamp: string;
}

interface WithIdentity {
  identity_id: string;
  platform_user_id: string | null;
}

export interface VerificationInitiatedEvent extends BaseWebhookEvent {
  event: 'verification.initiated';
  session_token: string;
  phone: string;
  otp_channel: OtpChannel;
  flow_id: string | null;
  lang: string;
}

export interface VerificationOtpSentEvent extends BaseWebhookEvent {
  event: 'verification.otp.sent';
  session_token: string;
  otp_channel: OtpChannel;
  attempt_number: number;
}

export interface VerificationOtpVerifiedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'verification.otp.verified';
  session_token: string;
}

export interface VerificationIdUploadedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'verification.id.uploaded';
  session_token: string;
  id_type: string | null;
  country_code: string | null;
}

export interface VerificationFaceSubmittedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'verification.face.submitted';
  session_token: string;
}

export interface VerificationCompletedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'verification.completed';
  session_token: string;
  result: VerificationResult;
  verification_level: number;
  level_label: 'none' | 'basic' | 'biometric';
  trust_score: number;
  checks: { otp: boolean; id_document: boolean | null; face_match: boolean | null; aml: boolean | null };
}

export interface VerificationExpiredEvent extends BaseWebhookEvent {
  event: 'verification.expired';
  session_token: string;
  reached_step: 'otp' | 'id_upload' | 'face' | 'pending';
}

export interface IdentityCreatedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'identity.created';
  phone: string;
  verification_level: number;
  level_label: 'none' | 'basic' | 'biometric';
}

export interface IdentityVerificationUpdatedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'identity.verification_updated';
  verification_level: number;
  level_label: 'none' | 'basic' | 'biometric';
  trust_score?: number;
}

export interface IdentityConnectedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'identity.connected';
  api_key_id: string;
}

export interface IdentityConnectionRevokedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'identity.connection_revoked';
}

export interface IdentityFlaggedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'identity.flagged';
  flag_id: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
  flagged_by: 'developer' | 'system';
}

export interface IdentityVouchedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'identity.vouched';
  vouch_id: string;
  vouching_platform: string;
}

export interface TrustScoreUpdatedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'trust.score_updated';
  trust_score: number;
  trust_level: TrustLevel;
  score_delta: number;
  level_changed: boolean;
  trust_event_type: string;
}

export interface TrustThresholdCrossedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'trust.threshold_crossed';
  trust_score: number;
  trust_level: TrustLevel;
  previous_level: TrustLevel;
  direction: 'up' | 'down';
}

export interface TrustLevelChangedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'trust.level_changed';
  previous_level: TrustLevel;
  new_level: TrustLevel;
  trust_score: number;
}

export interface AmlScreenedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'aml.screened';
  aml_status: AmlStatus;
  previous_status: AmlStatus | null;
  match_count: number;
  screened_at: string;
}

export interface AmlUpdatedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'identity.aml_updated';
  aml_status: 'clear' | 'flagged' | 'blocked';
  previous_status: string;
}

export interface AmlAlertCreatedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'aml.alert.created';
  alert_id: string;
  match_name: string;
  match_score: number;
  list_source: string;
}

export interface AmlAlertResolvedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'aml.alert.resolved';
  alert_id: string;
  resolution: 'false_positive' | 'confirmed' | 'escalated';
  resolved_by: string;
}

export interface RiskFlagCreatedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'risk.flag.created';
  flag_id: string;
  rule_id: string;
  rule_name: string;
  action_taken: string;
  trust_delta: number | null;
}

export interface RiskFlagResolvedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'risk.flag.resolved';
  flag_id: string;
  resolved_by: string;
}

export interface RiskScoreChangedEvent extends BaseWebhookEvent, WithIdentity {
  event: 'risk.score_changed';
  previous_risk_level: string;
  new_risk_level: string;
  contributing_flags: number;
}

export interface KybInitiatedEvent extends BaseWebhookEvent {
  event: 'kyb.initiated';
  kyb_entity_id: string;
  business_name: string;
}

export interface KybStatusUpdatedEvent extends BaseWebhookEvent {
  event: 'kyb.status_updated';
  kyb_entity_id: string;
  verification_status: 'verified' | 'rejected';
  rejection_reason?: string;
}

export interface KybCompletedEvent extends BaseWebhookEvent {
  event: 'kyb.completed';
  kyb_entity_id: string;
  result: 'verified' | 'rejected';
  rejection_reason?: string;
  verified_at: string | null;
}

export interface SubscriptionActivatedEvent extends BaseWebhookEvent {
  event: 'subscription.activated';
  plan: PlanName;
  previous_plan: PlanName | null;
  verifications_included: number;
  period_start: string;
  period_end: string;
}

export interface SubscriptionExpiredEvent extends BaseWebhookEvent {
  event: 'subscription.expired';
  plan: PlanName;
  period_end: string;
  reason: 'non_renewal' | 'cancellation' | 'payment_failed';
}

export interface UsageThresholdReachedEvent extends BaseWebhookEvent {
  event: 'usage.threshold_reached';
  plan: PlanName;
  threshold_percent: 80 | 100;
  verifications_used: number;
  verifications_included: number;
  period_end: string;
}

export type WebhookEvent =
  | VerificationInitiatedEvent | VerificationOtpSentEvent | VerificationOtpVerifiedEvent
  | VerificationIdUploadedEvent | VerificationFaceSubmittedEvent | VerificationCompletedEvent
  | VerificationExpiredEvent
  | IdentityCreatedEvent | IdentityVerificationUpdatedEvent | IdentityConnectedEvent
  | IdentityConnectionRevokedEvent | IdentityFlaggedEvent | IdentityVouchedEvent
  | TrustScoreUpdatedEvent | TrustThresholdCrossedEvent | TrustLevelChangedEvent
  | AmlScreenedEvent | AmlUpdatedEvent | AmlAlertCreatedEvent | AmlAlertResolvedEvent
  | RiskFlagCreatedEvent | RiskFlagResolvedEvent | RiskScoreChangedEvent
  | KybInitiatedEvent | KybStatusUpdatedEvent | KybCompletedEvent
  | SubscriptionActivatedEvent | SubscriptionExpiredEvent | UsageThresholdReachedEvent;

export type WebhookEventType = WebhookEvent['event'];

export const WEBHOOK_EVENT_TYPES: readonly WebhookEventType[] = [
  'verification.initiated', 'verification.otp.sent', 'verification.otp.verified',
  'verification.id.uploaded', 'verification.face.submitted', 'verification.completed',
  'verification.expired',
  'identity.created', 'identity.verification_updated', 'identity.connected',
  'identity.connection_revoked', 'identity.flagged', 'identity.vouched',
  'trust.score_updated', 'trust.threshold_crossed', 'trust.level_changed',
  'aml.screened', 'identity.aml_updated', 'aml.alert.created', 'aml.alert.resolved',
  'risk.flag.created', 'risk.flag.resolved', 'risk.score_changed',
  'kyb.initiated', 'kyb.status_updated', 'kyb.completed',
  'subscription.activated', 'subscription.expired', 'usage.threshold_reached',
] as const;
