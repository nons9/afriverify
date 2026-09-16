-- Persona-style "Inquiries": shareable, no-code verification links
CREATE TYPE inquiry_status_enum AS ENUM ('active', 'completed', 'expired', 'revoked');

CREATE TABLE inquiry_links (
  id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            VARCHAR(32)         NOT NULL UNIQUE,
  api_key_id      UUID                NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  developer_email TEXT                NOT NULL,
  label           VARCHAR(255)        NOT NULL,
  description     TEXT,
  allowed_id_types TEXT[]             NOT NULL DEFAULT '{}',
  require_liveness BOOLEAN            NOT NULL DEFAULT false,
  redirect_url    VARCHAR(2048),
  webhook_url     VARCHAR(2048),
  status          inquiry_status_enum NOT NULL DEFAULT 'active',
  max_uses        INTEGER,
  current_uses    INTEGER             NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE TABLE inquiry_submissions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id    UUID        NOT NULL REFERENCES inquiry_links(id) ON DELETE CASCADE,
  identity_id   UUID        REFERENCES verified_identities(id) ON DELETE SET NULL,
  session_id    UUID,
  result        TEXT        NOT NULL DEFAULT 'pending',
  completed_at  TIMESTAMPTZ,
  ip_hash       VARCHAR(64),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_il_slug          ON inquiry_links(slug);
CREATE INDEX idx_il_api_key_id    ON inquiry_links(api_key_id);
CREATE INDEX idx_il_developer     ON inquiry_links(developer_email);
CREATE INDEX idx_il_status        ON inquiry_links(status);
CREATE INDEX idx_is_inquiry_id    ON inquiry_submissions(inquiry_id);
CREATE INDEX idx_is_identity_id   ON inquiry_submissions(identity_id);
