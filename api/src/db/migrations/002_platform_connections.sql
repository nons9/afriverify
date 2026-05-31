CREATE TABLE platform_connections (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id         UUID         NOT NULL REFERENCES verified_identities(id) ON DELETE CASCADE,
  platform_name       VARCHAR(255) NOT NULL,
  platform_api_key_id UUID,
  platform_user_id    VARCHAR(255),
  connected_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_verified       TIMESTAMPTZ,
  is_active           BOOLEAN      NOT NULL DEFAULT true,
  UNIQUE(identity_id, platform_name)
);

CREATE INDEX idx_pc_identity_id   ON platform_connections(identity_id);
CREATE INDEX idx_pc_platform_name ON platform_connections(platform_name);
CREATE INDEX idx_pc_active        ON platform_connections(is_active) WHERE is_active = true;
