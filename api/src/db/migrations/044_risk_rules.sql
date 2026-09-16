-- Fix: verification_sessions was missing columns queried by admin routes.
-- type and status are derived via GENERATED ALWAYS so verify routes need no changes.
ALTER TABLE verification_sessions
  ADD COLUMN IF NOT EXISTS type TEXT GENERATED ALWAYS AS (
    CASE
      WHEN face_photo_s3_key IS NOT NULL THEN 'biometric'
      WHEN id_photo_s3_key IS NOT NULL THEN 'document'
      ELSE 'basic'
    END
  ) STORED,
  ADD COLUMN IF NOT EXISTS status TEXT GENERATED ALWAYS AS (step::text) STORED,
  ADD COLUMN IF NOT EXISTS risk_level TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Back-fill completed_at for already-finished sessions (no updated_at on the table;
-- created_at is a rough proxy — better than NULL for display purposes).
UPDATE verification_sessions
SET completed_at = created_at
WHERE step IN ('complete', 'failed') AND completed_at IS NULL;

-- Risk rules: configurable conditions → actions evaluated against identities.
CREATE TABLE risk_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(255) NOT NULL,
  description      TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  priority         INTEGER NOT NULL DEFAULT 100,  -- lower = evaluated first
  conditions       JSONB NOT NULL DEFAULT '[]'::jsonb,
  conditions_mode  VARCHAR(10) NOT NULL DEFAULT 'all'
                     CHECK (conditions_mode IN ('all', 'any')),
  action           VARCHAR(30) NOT NULL
                     CHECK (action IN ('trust_delta', 'flag')),
  action_params    JSONB,  -- {"delta": -50} for trust_delta
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Flags raised by risk rule evaluation, resolved by admins manually.
CREATE TABLE risk_flags (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id         UUID NOT NULL REFERENCES verified_identities(id) ON DELETE CASCADE,
  rule_id             UUID NOT NULL REFERENCES risk_rules(id) ON DELETE CASCADE,
  rule_name           VARCHAR(255) NOT NULL,
  triggered_context   JSONB NOT NULL,
  resolved_at         TIMESTAMPTZ,
  resolved_by         VARCHAR(255),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_risk_flags_open ON risk_flags(identity_id) WHERE resolved_at IS NULL;
CREATE INDEX idx_risk_flags_created ON risk_flags(created_at DESC);

-- Seed sensible defaults.
INSERT INTO risk_rules (name, description, priority, conditions, conditions_mode, action, action_params) VALUES
  ('AML flagged — trust penalty',
   'Reduce trust score by 50 when AML screening returns flagged.',
   10,
   '[{"field":"aml_status","operator":"eq","value":"flagged"}]',
   'all', 'trust_delta', '{"delta":-50}'),
  ('AML blocked — flag for review',
   'Flag identity for manual admin review when AML screen returns blocked.',
   5,
   '[{"field":"aml_status","operator":"eq","value":"blocked"}]',
   'all', 'flag', null),
  ('Low trust score — flag for review',
   'Flag any identity whose trust score falls below 150.',
   50,
   '[{"field":"trust_score","operator":"lt","value":150}]',
   'all', 'flag', null);
