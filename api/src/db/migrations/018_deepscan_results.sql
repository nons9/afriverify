-- Migration 018: deepscan_results
-- OrbitShield: DeepScan — Deepfake + Document Authenticity Pre-Screen
-- Runs BEFORE Smile Identity on every ID document upload and selfie submission.
-- Catches AI-generated faces, screen replay attacks, and synthetic documents.
-- APPEND-ONLY — immutable record of every scan decision.

CREATE TYPE deepscan_verdict_enum AS ENUM ('clear', 'suspicious', 'rejected', 'skipped');

CREATE TABLE IF NOT EXISTS deepscan_results (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id    UUID REFERENCES verified_identities(id),
  session_id     UUID,            -- references verification_sessions(id), soft FK for flexibility
  scan_type      VARCHAR(20) NOT NULL CHECK (scan_type IN ('id_document', 'selfie')),
  verdict        deepscan_verdict_enum NOT NULL,
  confidence     DECIMAL(5,2) NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  signals        JSONB NOT NULL DEFAULT '{}',   -- individual signal flags, no PII
  provider       VARCHAR(50) NOT NULL,          -- 'aws_rekognition' | 'internal'
  processing_ms  INTEGER,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deepscan_identity
  ON deepscan_results (identity_id, created_at DESC)
  WHERE identity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deepscan_verdict_recent
  ON deepscan_results (verdict, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deepscan_session
  ON deepscan_results (session_id)
  WHERE session_id IS NOT NULL;

-- APPEND-ONLY enforcement
CREATE RULE no_update_deepscan_results AS ON UPDATE TO deepscan_results DO INSTEAD NOTHING;
CREATE RULE no_delete_deepscan_results AS ON DELETE TO deepscan_results DO INSTEAD NOTHING;
