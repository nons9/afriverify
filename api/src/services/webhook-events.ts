/**
 * AfriVerify webhook event catalog — v1
 *
 * Every event payload extends BaseEvent. Fields shared across groups are
 * factored into intermediate interfaces so individual payloads stay minimal.
 *
 * Delivery envelope (added by the delivery layer, not the payload):
 *   X-VerifyAfrica-Event:     <event type string>
 *   X-VerifyAfrica-Signature: sha512=<hmac-hex>
 *   X-VerifyAfrica-Timestamp: <ISO-8601>
 *   X-VerifyAfrica-Attempt:   <1|2|3>
 */

// ─── Base ─────────────────────────────────────────────────────────────────────

interface BaseEvent {
  schema_version: 'v1';
  timestamp: string; // ISO-8601
}

interface WithIdentity {
  identity_id: string;
  platform_user_id: string | null;
}

// ─── Verification events (7) ──────────────────────────────────────────────────

export interface VerificationInitiatedEvent extends BaseEvent {
  event: 'verification.initiated';
  session_token: string;
  phone: string;
  otp_channel: 'sms' | 'email';
  flow_id: string | null;
  lang: string;
}

export interface VerificationOtpSentEvent extends BaseEvent {
  event: 'verification.otp.sent';
  session_token: string;
  otp_channel: 'sms' | 'email';
  attempt_number: number;
}

export interface VerificationOtpVerifiedEvent extends BaseEvent, WithIdentity {
  event: 'verification.otp.verified';
  session_token: string;
}

export interface VerificationIdUploadedEvent extends BaseEvent, WithIdentity {
  event: 'verification.id.uploaded';
  session_token: string;
  id_type: string | null;
  country_code: string | null;
}

export interface VerificationFaceSubmittedEvent extends BaseEvent, WithIdentity {
  event: 'verification.face.submitted';
  session_token: string;
}

export interface VerificationCompletedEvent extends BaseEvent, WithIdentity {
  event: 'verification.completed';
  session_token: string;
  result: 'pass' | 'fail' | 'review';
  verification_level: number;
  level_label: 'none' | 'basic' | 'biometric';
  trust_score: number;
  checks: {
    otp: boolean;
    id_document: boolean | null;
    face_match: boolean | null;
    aml: boolean | null;
  };
}

export interface VerificationExpiredEvent extends BaseEvent {
  event: 'verification.expired';
  session_token: string;
  reached_step: 'otp' | 'id_upload' | 'face' | 'pending';
}

// ─── Identity events (5) ──────────────────────────────────────────────────────

export interface IdentityCreatedEvent extends BaseEvent, WithIdentity {
  event: 'identity.created';
  phone: string;
  verification_level: number;
  level_label: 'none' | 'basic' | 'biometric';
}

/** Supersedes the pre-catalog `identity.verification_updated` event */
export interface IdentityVerificationUpdatedEvent extends BaseEvent, WithIdentity {
  event: 'identity.verification_updated';
  verification_level: number;
  level_label: 'none' | 'basic' | 'biometric';
  trust_score?: number;
}

export interface IdentityConnectedEvent extends BaseEvent, WithIdentity {
  event: 'identity.connected';
  api_key_id: string;
}

export interface IdentityConnectionRevokedEvent extends BaseEvent, WithIdentity {
  event: 'identity.connection_revoked';
}

export interface IdentityFlaggedEvent extends BaseEvent, WithIdentity {
  event: 'identity.flagged';
  flag_id: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
  flagged_by: 'developer' | 'system';
}

export interface IdentityVouchedEvent extends BaseEvent, WithIdentity {
  event: 'identity.vouched';
  vouch_id: string;
  vouching_platform: string;
}

// ─── Trust events (3) ────────────────────────────────────────────────────────

export type TrustLevel = 'unverified' | 'low' | 'moderate' | 'trusted' | 'highly_trusted';

export interface TrustScoreUpdatedEvent extends BaseEvent, WithIdentity {
  event: 'trust.score_updated';
  trust_score: number;
  trust_level: TrustLevel;
  score_delta: number;
  level_changed: boolean;
  trust_event_type: string;
}

export interface TrustThresholdCrossedEvent extends BaseEvent, WithIdentity {
  event: 'trust.threshold_crossed';
  trust_score: number;
  trust_level: TrustLevel;
  previous_level: TrustLevel;
  direction: 'up' | 'down';
}

export interface TrustLevelChangedEvent extends BaseEvent, WithIdentity {
  event: 'trust.level_changed';
  previous_level: TrustLevel;
  new_level: TrustLevel;
  trust_score: number;
}

// ─── AML events (4) ──────────────────────────────────────────────────────────

export type AmlStatus = 'clear' | 'potential_match' | 'confirmed_match' | 'blocked';

export interface AmlScreenedEvent extends BaseEvent, WithIdentity {
  event: 'aml.screened';
  aml_status: AmlStatus;
  previous_status: AmlStatus | null;
  match_count: number;
  screened_at: string;
}

/** Legacy alias kept for backwards compatibility */
export interface AmlUpdatedEvent extends BaseEvent, WithIdentity {
  event: 'identity.aml_updated';
  aml_status: 'clear' | 'flagged' | 'blocked';
  previous_status: string;
}

export interface AmlAlertCreatedEvent extends BaseEvent, WithIdentity {
  event: 'aml.alert.created';
  alert_id: string;
  match_name: string;
  match_score: number;
  list_source: string;
}

export interface AmlAlertResolvedEvent extends BaseEvent, WithIdentity {
  event: 'aml.alert.resolved';
  alert_id: string;
  resolution: 'false_positive' | 'confirmed' | 'escalated';
  resolved_by: string;
}

// ─── Risk events (3) ─────────────────────────────────────────────────────────

export interface RiskFlagCreatedEvent extends BaseEvent, WithIdentity {
  event: 'risk.flag.created';
  flag_id: string;
  rule_id: string;
  rule_name: string;
  action_taken: string;
  trust_delta: number | null;
}

export interface RiskFlagResolvedEvent extends BaseEvent, WithIdentity {
  event: 'risk.flag.resolved';
  flag_id: string;
  resolved_by: string;
}

export interface RiskScoreChangedEvent extends BaseEvent, WithIdentity {
  event: 'risk.score_changed';
  previous_risk_level: string;
  new_risk_level: string;
  contributing_flags: number;
}

// ─── KYB events (3) ──────────────────────────────────────────────────────────

export interface KybInitiatedEvent extends BaseEvent {
  event: 'kyb.initiated';
  kyb_entity_id: string;
  business_name: string;
}

/** Supersedes the pre-catalog `kyb.status_updated` event */
export interface KybStatusUpdatedEvent extends BaseEvent {
  event: 'kyb.status_updated';
  kyb_entity_id: string;
  verification_status: 'verified' | 'rejected';
  rejection_reason?: string;
}

export interface KybCompletedEvent extends BaseEvent {
  event: 'kyb.completed';
  kyb_entity_id: string;
  result: 'verified' | 'rejected';
  rejection_reason?: string;
  verified_at: string | null;
}

// ─── Subscription / usage events (3) ─────────────────────────────────────────

export type PlanName = 'starter' | 'growth' | 'enterprise';

export interface SubscriptionActivatedEvent extends BaseEvent {
  event: 'subscription.activated';
  plan: PlanName;
  previous_plan: PlanName | null;
  verifications_included: number;
  period_start: string;
  period_end: string;
}

export interface SubscriptionExpiredEvent extends BaseEvent {
  event: 'subscription.expired';
  plan: PlanName;
  period_end: string;
  reason: 'non_renewal' | 'cancellation' | 'payment_failed';
}

export interface UsageThresholdReachedEvent extends BaseEvent {
  event: 'usage.threshold_reached';
  plan: PlanName;
  threshold_percent: 80 | 100;
  verifications_used: number;
  verifications_included: number;
  period_end: string;
}

// ─── Union & catalog ─────────────────────────────────────────────────────────

export type WebhookEvent =
  // Verification
  | VerificationInitiatedEvent
  | VerificationOtpSentEvent
  | VerificationOtpVerifiedEvent
  | VerificationIdUploadedEvent
  | VerificationFaceSubmittedEvent
  | VerificationCompletedEvent
  | VerificationExpiredEvent
  // Identity
  | IdentityCreatedEvent
  | IdentityVerificationUpdatedEvent
  | IdentityConnectedEvent
  | IdentityConnectionRevokedEvent
  | IdentityFlaggedEvent
  | IdentityVouchedEvent
  // Trust
  | TrustScoreUpdatedEvent
  | TrustThresholdCrossedEvent
  | TrustLevelChangedEvent
  // AML
  | AmlScreenedEvent
  | AmlUpdatedEvent
  | AmlAlertCreatedEvent
  | AmlAlertResolvedEvent
  // Risk
  | RiskFlagCreatedEvent
  | RiskFlagResolvedEvent
  | RiskScoreChangedEvent
  // KYB
  | KybInitiatedEvent
  | KybStatusUpdatedEvent
  | KybCompletedEvent
  // Subscription / usage
  | SubscriptionActivatedEvent
  | SubscriptionExpiredEvent
  | UsageThresholdReachedEvent;

export type WebhookEventType = WebhookEvent['event'];

/** All known event type strings — useful for webhook filter UIs */
export const WEBHOOK_EVENT_TYPES: readonly WebhookEventType[] = [
  'verification.initiated',
  'verification.otp.sent',
  'verification.otp.verified',
  'verification.id.uploaded',
  'verification.face.submitted',
  'verification.completed',
  'verification.expired',
  'identity.created',
  'identity.verification_updated',
  'identity.connected',
  'identity.connection_revoked',
  'identity.flagged',
  'identity.vouched',
  'trust.score_updated',
  'trust.threshold_crossed',
  'trust.level_changed',
  'aml.screened',
  'identity.aml_updated',
  'aml.alert.created',
  'aml.alert.resolved',
  'risk.flag.created',
  'risk.flag.resolved',
  'risk.score_changed',
  'kyb.initiated',
  'kyb.status_updated',
  'kyb.completed',
  'subscription.activated',
  'subscription.expired',
  'usage.threshold_reached',
] as const;

// ─── Builder helpers ──────────────────────────────────────────────────────────

function base(): Pick<BaseEvent, 'schema_version' | 'timestamp'> {
  return { schema_version: 'v1', timestamp: new Date().toISOString() };
}

export const buildEvent = {
  verificationInitiated: (
    sessionToken: string,
    phone: string,
    otpChannel: 'sms' | 'email',
    flowId: string | null,
    lang: string,
  ): VerificationInitiatedEvent => ({
    ...base(),
    event: 'verification.initiated',
    session_token: sessionToken,
    phone,
    otp_channel: otpChannel,
    flow_id: flowId,
    lang,
  }),

  verificationOtpSent: (
    sessionToken: string,
    otpChannel: 'sms' | 'email',
    attemptNumber: number,
  ): VerificationOtpSentEvent => ({
    ...base(),
    event: 'verification.otp.sent',
    session_token: sessionToken,
    otp_channel: otpChannel,
    attempt_number: attemptNumber,
  }),

  verificationOtpVerified: (
    sessionToken: string,
    identityId: string,
    platformUserId: string | null,
  ): VerificationOtpVerifiedEvent => ({
    ...base(),
    event: 'verification.otp.verified',
    session_token: sessionToken,
    identity_id: identityId,
    platform_user_id: platformUserId,
  }),

  verificationIdUploaded: (
    sessionToken: string,
    identityId: string,
    platformUserId: string | null,
    idType: string | null,
    countryCode: string | null,
  ): VerificationIdUploadedEvent => ({
    ...base(),
    event: 'verification.id.uploaded',
    session_token: sessionToken,
    identity_id: identityId,
    platform_user_id: platformUserId,
    id_type: idType,
    country_code: countryCode,
  }),

  verificationFaceSubmitted: (
    sessionToken: string,
    identityId: string,
    platformUserId: string | null,
  ): VerificationFaceSubmittedEvent => ({
    ...base(),
    event: 'verification.face.submitted',
    session_token: sessionToken,
    identity_id: identityId,
    platform_user_id: platformUserId,
  }),

  verificationCompleted: (
    sessionToken: string,
    identityId: string,
    platformUserId: string | null,
    result: 'pass' | 'fail' | 'review',
    level: number,
    trustScore: number,
    checks: VerificationCompletedEvent['checks'],
  ): VerificationCompletedEvent => {
    const labels: Record<number, 'none' | 'basic' | 'biometric'> = { 0: 'none', 1: 'basic', 2: 'biometric' };
    return {
      ...base(),
      event: 'verification.completed',
      session_token: sessionToken,
      identity_id: identityId,
      platform_user_id: platformUserId,
      result,
      verification_level: level,
      level_label: labels[level] ?? 'none',
      trust_score: trustScore,
      checks,
    };
  },

  verificationExpired: (
    sessionToken: string,
    reachedStep: VerificationExpiredEvent['reached_step'],
  ): VerificationExpiredEvent => ({
    ...base(),
    event: 'verification.expired',
    session_token: sessionToken,
    reached_step: reachedStep,
  }),

  identityCreated: (
    identityId: string,
    platformUserId: string | null,
    phone: string,
    level: number,
  ): IdentityCreatedEvent => {
    const labels: Record<number, 'none' | 'basic' | 'biometric'> = { 0: 'none', 1: 'basic', 2: 'biometric' };
    return {
      ...base(),
      event: 'identity.created',
      identity_id: identityId,
      platform_user_id: platformUserId,
      phone,
      verification_level: level,
      level_label: labels[level] ?? 'none',
    };
  },

  identityConnected: (
    identityId: string,
    platformUserId: string | null,
    apiKeyId: string,
  ): IdentityConnectedEvent => ({
    ...base(),
    event: 'identity.connected',
    identity_id: identityId,
    platform_user_id: platformUserId,
    api_key_id: apiKeyId,
  }),

  identityFlagged: (
    identityId: string,
    platformUserId: string | null,
    flagId: string,
    reason: string,
    severity: 'low' | 'medium' | 'high',
    flaggedBy: 'developer' | 'system',
  ): IdentityFlaggedEvent => ({
    ...base(),
    event: 'identity.flagged',
    identity_id: identityId,
    platform_user_id: platformUserId,
    flag_id: flagId,
    reason,
    severity,
    flagged_by: flaggedBy,
  }),

  trustThresholdCrossed: (
    identityId: string,
    platformUserId: string | null,
    trustScore: number,
    newLevel: TrustLevel,
    previousLevel: TrustLevel,
  ): TrustThresholdCrossedEvent => ({
    ...base(),
    event: 'trust.threshold_crossed',
    identity_id: identityId,
    platform_user_id: platformUserId,
    trust_score: trustScore,
    trust_level: newLevel,
    previous_level: previousLevel,
    direction: trustScore > 0 ? 'up' : 'down',
  }),

  amlScreened: (
    identityId: string,
    platformUserId: string | null,
    status: AmlStatus,
    previousStatus: AmlStatus | null,
    matchCount: number,
  ): AmlScreenedEvent => ({
    ...base(),
    event: 'aml.screened',
    identity_id: identityId,
    platform_user_id: platformUserId,
    aml_status: status,
    previous_status: previousStatus,
    match_count: matchCount,
    screened_at: new Date().toISOString(),
  }),

  amlAlertCreated: (
    identityId: string,
    platformUserId: string | null,
    alertId: string,
    matchName: string,
    matchScore: number,
    listSource: string,
  ): AmlAlertCreatedEvent => ({
    ...base(),
    event: 'aml.alert.created',
    identity_id: identityId,
    platform_user_id: platformUserId,
    alert_id: alertId,
    match_name: matchName,
    match_score: matchScore,
    list_source: listSource,
  }),

  riskFlagCreated: (
    identityId: string,
    platformUserId: string | null,
    flagId: string,
    ruleId: string,
    ruleName: string,
    actionTaken: string,
    trustDelta: number | null,
  ): RiskFlagCreatedEvent => ({
    ...base(),
    event: 'risk.flag.created',
    identity_id: identityId,
    platform_user_id: platformUserId,
    flag_id: flagId,
    rule_id: ruleId,
    rule_name: ruleName,
    action_taken: actionTaken,
    trust_delta: trustDelta,
  }),

  subscriptionActivated: (
    plan: PlanName,
    previousPlan: PlanName | null,
    verificationsIncluded: number,
    periodStart: string,
    periodEnd: string,
  ): SubscriptionActivatedEvent => ({
    ...base(),
    event: 'subscription.activated',
    plan,
    previous_plan: previousPlan,
    verifications_included: verificationsIncluded,
    period_start: periodStart,
    period_end: periodEnd,
  }),

  usageThresholdReached: (
    plan: PlanName,
    thresholdPercent: 80 | 100,
    verificationsUsed: number,
    verificationsIncluded: number,
    periodEnd: string,
  ): UsageThresholdReachedEvent => ({
    ...base(),
    event: 'usage.threshold_reached',
    plan,
    threshold_percent: thresholdPercent,
    verifications_used: verificationsUsed,
    verifications_included: verificationsIncluded,
    period_end: periodEnd,
  }),
};
