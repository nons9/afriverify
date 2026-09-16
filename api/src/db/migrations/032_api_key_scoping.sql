-- Intent-scoped API keys: scope, intent label, flow allowlist, sub-key delegation, expiry
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS scope         TEXT         NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS intent        TEXT,
  ADD COLUMN IF NOT EXISTS allowed_flows JSONB        NOT NULL DEFAULT '["kyc","trust","aml"]',
  ADD COLUMN IF NOT EXISTS parent_key_id UUID         REFERENCES api_keys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expires_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ak_parent_key ON api_keys(parent_key_id) WHERE parent_key_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ak_scope      ON api_keys(scope);
CREATE INDEX IF NOT EXISTS idx_ak_expires_at ON api_keys(expires_at) WHERE expires_at IS NOT NULL;
