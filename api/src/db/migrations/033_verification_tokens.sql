-- Short-lived, single-use verification tokens (per-session "invitation" tokens)
CREATE TABLE verification_tokens (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash     VARCHAR(64)  NOT NULL UNIQUE,
  token_prefix   VARCHAR(16)  NOT NULL,
  api_key_id     UUID         NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  identity_id    UUID         REFERENCES verified_identities(id) ON DELETE SET NULL,
  allowed_flows  JSONB        NOT NULL DEFAULT '["kyc"]',
  metadata       JSONB        NOT NULL DEFAULT '{}',
  used           BOOLEAN      NOT NULL DEFAULT false,
  used_at        TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ  NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vt_token_hash ON verification_tokens(token_hash);
CREATE INDEX idx_vt_api_key_id ON verification_tokens(api_key_id);
CREATE INDEX idx_vt_expires_at ON verification_tokens(expires_at);
