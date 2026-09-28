package afriverify

import "encoding/json"

// ─── Verify ──────────────────────────────────────────────────────────────────

// InitiateParams starts a new identity verification session.
type InitiateParams struct {
	Phone          string `json:"phone"`
	Email          string `json:"email,omitempty"`
	OtpChannel     string `json:"otp_channel,omitempty"` // "sms" | "email"
	PlatformUserID string `json:"platform_user_id,omitempty"`
	RedirectURL    string `json:"redirect_url,omitempty"`
	FlowID         string `json:"flow_id,omitempty"`
	Lang           string `json:"lang,omitempty"` // "en" | "fr"
}

type InitiateResponse struct {
	SessionToken string `json:"session_token"`
	ExpiresAt    string `json:"expires_at"`
	OtpChannel   string `json:"otp_channel"`
}

type SendOtpParams struct {
	SessionToken string `json:"session_token"`
}

type SendOtpResponse struct {
	Sent       bool   `json:"sent"`
	OtpChannel string `json:"otp_channel"`
}

type ConfirmOtpParams struct {
	SessionToken string `json:"session_token"`
	Code         string `json:"code"`
}

type ConfirmOtpResponse struct {
	Verified bool   `json:"verified"`
	NextStep string `json:"next_step"`
}

type UploadIDResponse struct {
	Uploaded bool   `json:"uploaded"`
	NextStep string `json:"next_step"`
}

type SubmitFaceResponse struct {
	Submitted  bool    `json:"submitted"`
	Result     string  `json:"result"`
	TrustScore float64 `json:"trust_score,omitempty"`
}

type SessionStatusResponse struct {
	SessionToken string  `json:"session_token"`
	Status       string  `json:"status"`
	Result       string  `json:"result"`
	TrustScore   float64 `json:"trust_score,omitempty"`
	IdentityID   string  `json:"identity_id,omitempty"`
	CompletedAt  string  `json:"completed_at,omitempty"`
}

// ─── Identity ─────────────────────────────────────────────────────────────────

type IdentityCheckParams struct {
	Phone      string
	Email      string
	IdentityID string
}

type IdentityCheckResponse struct {
	Found      bool    `json:"found"`
	IdentityID string  `json:"identity_id,omitempty"`
	TrustScore float64 `json:"trust_score,omitempty"`
	VerifiedAt string  `json:"verified_at,omitempty"`
}

type ConnectParams struct {
	SessionToken   string `json:"session_token"`
	PlatformUserID string `json:"platform_user_id"`
}

type ConnectResponse struct {
	Connected      bool   `json:"connected"`
	IdentityID     string `json:"identity_id"`
	PlatformUserID string `json:"platform_user_id"`
}

type IdentityProfile struct {
	IdentityID  string  `json:"identity_id"`
	Phone       string  `json:"phone"`
	Email       string  `json:"email,omitempty"`
	FullName    string  `json:"full_name,omitempty"`
	TrustScore  float64 `json:"trust_score"`
	VerifiedAt  string  `json:"verified_at,omitempty"`
	CountryCode string  `json:"country_code,omitempty"`
	IDType      string  `json:"id_type,omitempty"`
	AmlStatus   string  `json:"aml_status,omitempty"`
	RiskLevel   string  `json:"risk_level,omitempty"`
}

type FlagParams struct {
	IdentityID string `json:"identity_id"`
	Reason     string `json:"reason"`
	Severity   string `json:"severity,omitempty"` // "low" | "medium" | "high"
}

type FlagResponse struct {
	Flagged bool   `json:"flagged"`
	FlagID  string `json:"flag_id"`
}

type VouchParams struct {
	IdentityID string `json:"identity_id"`
	Note       string `json:"note,omitempty"`
}

type VouchResponse struct {
	Vouched bool   `json:"vouched"`
	VouchID string `json:"vouch_id"`
}

type Vouch struct {
	VouchID      string `json:"vouch_id"`
	PlatformName string `json:"platform_name"`
	CreatedAt    string `json:"created_at"`
	Note         string `json:"note,omitempty"`
}

type VouchesResponse struct {
	Vouches []Vouch `json:"vouches"`
}

// ─── Webhook events ───────────────────────────────────────────────────────────

// WebhookEvent is the parsed webhook payload. Switch on Event to determine the
// specific type, then unmarshal Raw into the matching concrete struct.
type WebhookEvent struct {
	SchemaVersion  string          `json:"schema_version"`
	Event          string          `json:"event"`
	Timestamp      string          `json:"timestamp"`
	IdentityID     string          `json:"identity_id,omitempty"`
	PlatformUserID *string         `json:"platform_user_id,omitempty"`
	SessionToken   string          `json:"session_token,omitempty"`
	Raw            json.RawMessage `json:"-"`
}

// Concrete event types — unmarshal Raw into one of these after switching on Event.

type VerificationInitiatedEvent struct {
	SchemaVersion string  `json:"schema_version"`
	Event         string  `json:"event"`
	Timestamp     string  `json:"timestamp"`
	SessionToken  string  `json:"session_token"`
	Phone         string  `json:"phone"`
	OtpChannel    string  `json:"otp_channel"`
	FlowID        *string `json:"flow_id"`
	Lang          string  `json:"lang"`
}

type VerificationCompletedEvent struct {
	SchemaVersion      string  `json:"schema_version"`
	Event              string  `json:"event"`
	Timestamp          string  `json:"timestamp"`
	SessionToken       string  `json:"session_token"`
	IdentityID         string  `json:"identity_id"`
	PlatformUserID     *string `json:"platform_user_id"`
	Result             string  `json:"result"`
	VerificationLevel  int     `json:"verification_level"`
	LevelLabel         string  `json:"level_label"`
	TrustScore         float64 `json:"trust_score"`
}

type VerificationExpiredEvent struct {
	SchemaVersion string `json:"schema_version"`
	Event         string `json:"event"`
	Timestamp     string `json:"timestamp"`
	SessionToken  string `json:"session_token"`
	ReachedStep   string `json:"reached_step"`
}

type TrustScoreUpdatedEvent struct {
	SchemaVersion  string  `json:"schema_version"`
	Event          string  `json:"event"`
	Timestamp      string  `json:"timestamp"`
	IdentityID     string  `json:"identity_id"`
	PlatformUserID *string `json:"platform_user_id"`
	TrustScore     float64 `json:"trust_score"`
	TrustLevel     string  `json:"trust_level"`
	ScoreDelta     float64 `json:"score_delta"`
	LevelChanged   bool    `json:"level_changed"`
}

type IdentityFlaggedEvent struct {
	SchemaVersion  string  `json:"schema_version"`
	Event          string  `json:"event"`
	Timestamp      string  `json:"timestamp"`
	IdentityID     string  `json:"identity_id"`
	PlatformUserID *string `json:"platform_user_id"`
	FlagID         string  `json:"flag_id"`
	Reason         string  `json:"reason"`
	Severity       string  `json:"severity"`
	FlaggedBy      string  `json:"flagged_by"`
}

type AmlScreenedEvent struct {
	SchemaVersion  string  `json:"schema_version"`
	Event          string  `json:"event"`
	Timestamp      string  `json:"timestamp"`
	IdentityID     string  `json:"identity_id"`
	PlatformUserID *string `json:"platform_user_id"`
	AmlStatus      string  `json:"aml_status"`
	PreviousStatus *string `json:"previous_status"`
	MatchCount     int     `json:"match_count"`
	ScreenedAt     string  `json:"screened_at"`
}

type SubscriptionActivatedEvent struct {
	SchemaVersion         string  `json:"schema_version"`
	Event                 string  `json:"event"`
	Timestamp             string  `json:"timestamp"`
	Plan                  string  `json:"plan"`
	PreviousPlan          *string `json:"previous_plan"`
	VerificationsIncluded int     `json:"verifications_included"`
	PeriodStart           string  `json:"period_start"`
	PeriodEnd             string  `json:"period_end"`
}

type UsageThresholdReachedEvent struct {
	SchemaVersion         string `json:"schema_version"`
	Event                 string `json:"event"`
	Timestamp             string `json:"timestamp"`
	Plan                  string `json:"plan"`
	ThresholdPercent      int    `json:"threshold_percent"`
	VerificationsUsed     int    `json:"verifications_used"`
	VerificationsIncluded int    `json:"verifications_included"`
	PeriodEnd             string `json:"period_end"`
}
