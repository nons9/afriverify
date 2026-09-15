-- AfriApp Store connection: link a developer account to an AfriApp-issued
-- AFRIVERIFY key. Only one active connection per developer is allowed.
CREATE TABLE afriapp_connections (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_email  TEXT         NOT NULL REFERENCES developers(email) ON DELETE CASCADE,
  afriapp_key_hash VARCHAR(64)  NOT NULL,
  afriapp_owner_id VARCHAR(255) NOT NULL,
  connected_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ,
  is_active        BOOLEAN      NOT NULL DEFAULT true,
  UNIQUE (developer_email)
);

CREATE INDEX idx_ac_developer_email ON afriapp_connections(developer_email);
CREATE INDEX idx_ac_key_hash        ON afriapp_connections(afriapp_key_hash);
