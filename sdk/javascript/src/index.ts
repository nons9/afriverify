export { AfriVerify } from './client.js';
export type { AfriVerifyOptions } from './client.js';

export { AfriVerifyError, ApiError, WebhookSignatureError, ConfigurationError } from './errors.js';

export type {
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
  // Webhooks
  WebhookEvent,
  WebhookEventType,
  VerificationCompletedData,
  TrustUpdatedData,
  AmlScreenedData,
  // Shared
  OtpChannel, Lang, SessionStatus, VerificationResult,
} from './types.js';
