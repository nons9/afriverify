-- The identity portal lets a verified individual - not a platform's
-- developer - log in with their own phone number and see/manage which
-- platforms their VIT is trusted by. This is the consumer-facing half of
-- "verify once, trusted everywhere": platform_connections already tracks
-- the data, but until now nothing let the actual person who owns an
-- identity see or revoke it themselves.

ALTER TYPE ve_event_type_enum ADD VALUE 'identity_portal_login';
ALTER TYPE ve_event_type_enum ADD VALUE 'connection_revoked';

-- Separate from verification_sessions' otp_hash column: that OTP proves a
-- phone number during a NEW verification attempt tied to one platform's
-- api_key_id. This one authenticates the owner of an ALREADY-verified
-- identity for their own portal session, independent of any platform.
CREATE TABLE identity_login_otps (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      VARCHAR(20)  NOT NULL,
  otp_hash   VARCHAR(64)  NOT NULL,
  attempts   INTEGER      NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ  NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ilo_phone ON identity_login_otps(phone);
CREATE INDEX idx_ilo_expires_at ON identity_login_otps(expires_at);
