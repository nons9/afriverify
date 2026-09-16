export { AfriVerify } from './client.js';
export type { AfriVerifyOptions } from './client.js';

export { AfriVerifyError, ApiError, WebhookSignatureError, ConfigurationError } from './errors.js';

export { WEBHOOK_EVENT_TYPES } from './types.js';

export type {
  // Shared
  OtpChannel, Lang, SessionStatus, VerificationResult,
  TrustLevel, AmlStatus, PlanName,
  // Verify
  InitiateParams, InitiateResponse,
  SendOtpParams, SendOtpResponse,
  ConfirmOtpParams, ConfirmOtpResponse,
  UploadIdParams, UploadIdResponse,
  SubmitFaceParams, SubmitFaceResponse,
  SessionStatusResponse,
  // Identity
  IdentityCheckParams, IdentityCheckResponse,
  ConnectParams, ConnectResponse,
  IdentityProfile,
  FlagIdentityParams, FlagIdentityResponse,
  VouchParams, VouchResponse,
  Vouch,
  // Webhooks — union & discriminant
  WebhookEvent,
  WebhookEventType,
  // Webhook event shapes (all 29)
  VerificationInitiatedEvent,
  VerificationOtpSentEvent,
  VerificationOtpVerifiedEvent,
  VerificationIdUploadedEvent,
  VerificationFaceSubmittedEvent,
  VerificationCompletedEvent,
  VerificationExpiredEvent,
  IdentityCreatedEvent,
  IdentityVerificationUpdatedEvent,
  IdentityConnectedEvent,
  IdentityConnectionRevokedEvent,
  IdentityFlaggedEvent,
  IdentityVouchedEvent,
  TrustScoreUpdatedEvent,
  TrustThresholdCrossedEvent,
  TrustLevelChangedEvent,
  AmlScreenedEvent,
  AmlUpdatedEvent,
  AmlAlertCreatedEvent,
  AmlAlertResolvedEvent,
  RiskFlagCreatedEvent,
  RiskFlagResolvedEvent,
  RiskScoreChangedEvent,
  KybInitiatedEvent,
  KybStatusUpdatedEvent,
  KybCompletedEvent,
  SubscriptionActivatedEvent,
  SubscriptionExpiredEvent,
  UsageThresholdReachedEvent,
} from './types.js';
