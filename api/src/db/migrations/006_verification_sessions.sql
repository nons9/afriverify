CREATE TYPE vs_step_enum AS ENUM (
  'phone', 'otp', 'id_upload', 'face_scan', 'processing', 'complete', 'failed'
);

CREATE TABLE verification_sessions (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token     VARCHAR(64)  NOT NULL,
  phone             VARCHAR(20)  NOT NULL,
  otp_hash          VARCHAR(64),
  otp_attempts      INTEGER      NOT NULL DEFAULT 0,
  otp_expires_at    TIMESTAMPTZ,
  id_photo_s3_key   VARCHAR(512),
  face_photo_s3_key VARCHAR(512),
  step              vs_step_enum NOT NULL DEFAULT 'phone',
  api_key_id        UUID         NOT NULL REFERENCES api_keys(id),
  identity_id       UUID         REFERENCES verified_identities(id),
  ip_address        VARCHAR(45),
  device_id         VARCHAR(255),
  expires_at        TIMESTAMPTZ  NOT NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (session_token)
);

CREATE INDEX idx_vs_session_token ON verification_sessions(session_token);
CREATE INDEX idx_vs_phone         ON verification_sessions(phone);
CREATE INDEX idx_vs_api_key_id    ON verification_sessions(api_key_id);
CREATE INDEX idx_vs_expires_at    ON verification_sessions(expires_at);
CREATE INDEX idx_vs_identity_id   ON verification_sessions(identity_id);
