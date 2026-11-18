-- Migration 059: record which capture profile (standard or lite) produced each evaluation capture, so the
-- accuracy of Lite mode can be measured separately and compared with Standard.
ALTER TABLE liveness_eval_captures ADD COLUMN IF NOT EXISTS capture_profile VARCHAR(10) NOT NULL DEFAULT 'standard'
  CHECK (capture_profile IN ('standard','lite'));
