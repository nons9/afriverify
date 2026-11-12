-- Migration 049: live face scanning (own liveness engine, v1)
-- Each row is one capture attempt: the server-issued random challenge sequence,
-- the engine's verdict, and pointers to the (application-side encrypted) evidence in S3.

ALTER TABLE verification_sessions
  ADD COLUMN IF NOT EXISTS liveness_required  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS liveness_passed_at TIMESTAMPTZ;

CREATE TYPE liveness_status_enum AS ENUM ('issued', 'passed', 'review', 'failed', 'expired');

CREATE TABLE IF NOT EXISTS liveness_sessions (
  id                  UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID                 NOT NULL REFERENCES verification_sessions(id) ON DELETE CASCADE,
  identity_id         UUID                 REFERENCES verified_identities(id) ON DELETE SET NULL,
  attempt             INTEGER              NOT NULL DEFAULT 1,
  challenges          JSONB                NOT NULL,                 -- e.g. ["turn_left","blink","smile"], issued by the server
  status              liveness_status_enum NOT NULL DEFAULT 'issued',
  issued_at           TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ          NOT NULL,
  completed_at        TIMESTAMPTZ,

  -- consent captured before the camera opens (biometric data)
  consent_at          TIMESTAMPTZ          NOT NULL,
  consent_version     VARCHAR(20)          NOT NULL,

  -- engine output (no PII, no embeddings)
  liveness_score      DECIMAL(5,1),
  verdict             VARCHAR(10),
  reasons             JSONB                NOT NULL DEFAULT '[]',
  engine_result       JSONB                NOT NULL DEFAULT '{}',
  face_match_verdict  VARCHAR(12),
  face_match_score    DECIMAL(5,1),
  decision            VARCHAR(20),                                   -- approved | rejected | vendor_fallback | manual_review
  engine_version      VARCHAR(20),

  -- evidence (all objects encrypted application-side before upload)
  best_frame_s3_key   VARCHAR(512),
  frame_s3_keys       JSONB                NOT NULL DEFAULT '[]',
  video_s3_key        VARCHAR(512),
  evidence_purged_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_liveness_session  ON liveness_sessions (session_id, attempt);
CREATE INDEX IF NOT EXISTS idx_liveness_identity ON liveness_sessions (identity_id) WHERE identity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_liveness_purge    ON liveness_sessions (completed_at)
  WHERE evidence_purged_at IS NULL AND completed_at IS NOT NULL;
