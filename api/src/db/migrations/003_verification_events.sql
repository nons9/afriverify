CREATE TYPE ve_event_type_enum AS ENUM (
  'registration_attempt', 'otp_sent', 'otp_verified',
  'id_submitted', 'face_submitted', 'liveness_passed', 'liveness_failed',
  'id_verified', 'id_rejected', 'platform_connected', 'trust_update',
  'flag_received', 'blacklisted', 'aml_check', 'sanctions_check'
);

CREATE TYPE ve_result_enum AS ENUM ('passed', 'failed', 'flagged', 'pending');

CREATE TABLE verification_events (
  id              UUID                NOT NULL DEFAULT gen_random_uuid(),
  identity_id     UUID                REFERENCES verified_identities(id) ON DELETE SET NULL,
  event_type      ve_event_type_enum  NOT NULL,
  platform        VARCHAR(255),
  api_key_id      UUID,
  result          ve_result_enum      NOT NULL DEFAULT 'pending',
  score_delta     INTEGER,
  risk_score      FLOAT,
  ip_hash         VARCHAR(64),
  device_id       VARCHAR(255),
  user_agent_hash VARCHAR(64),
  geo_country     VARCHAR(10),
  metadata        JSONB               NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- Append-only: block UPDATE and DELETE at the rule level
CREATE RULE no_update_verification_events
  AS ON UPDATE TO verification_events DO INSTEAD NOTHING;
CREATE RULE no_delete_verification_events
  AS ON DELETE TO verification_events DO INSTEAD NOTHING;

CREATE INDEX idx_ve_identity_id ON verification_events(identity_id);
CREATE INDEX idx_ve_event_type  ON verification_events(event_type);
CREATE INDEX idx_ve_created_at  ON verification_events(created_at DESC);
CREATE INDEX idx_ve_platform    ON verification_events(platform);
CREATE INDEX idx_ve_result      ON verification_events(result);
