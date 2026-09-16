-- Persistent VIT storage so tokens can be revoked and usage logged.
-- Previously VITs were generated on-the-fly and never stored, making
-- revocation impossible. Now each issued VIT gets a row here; the
-- token_hash (SHA-256 of the full JWT) is the revocation key.
CREATE TABLE verified_identity_tokens (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash      VARCHAR(64)  NOT NULL UNIQUE,
  token_prefix    VARCHAR(16)  NOT NULL,          -- first 12 chars for display
  identity_id     UUID         NOT NULL REFERENCES verified_identities(id) ON DELETE CASCADE,
  is_revoked      BOOLEAN      NOT NULL DEFAULT false,
  usage_count     INTEGER      NOT NULL DEFAULT 0,
  last_used_at    TIMESTAMPTZ,
  last_used_by    TEXT,                            -- platform_name of last verifier
  expires_at      TIMESTAMPTZ  NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vit_identity  ON verified_identity_tokens(identity_id);
CREATE INDEX idx_vit_hash      ON verified_identity_tokens(token_hash);
CREATE INDEX idx_vit_expires   ON verified_identity_tokens(expires_at) WHERE NOT is_revoked;

-- Per-verification usage log for the identity portal's activity view.
CREATE TABLE vit_usage_log (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vit_id          UUID         NOT NULL REFERENCES verified_identity_tokens(id) ON DELETE CASCADE,
  api_key_id      UUID         REFERENCES api_keys(id) ON DELETE SET NULL,
  platform_name   TEXT,
  verified_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vit_usage_vit ON vit_usage_log(vit_id);
