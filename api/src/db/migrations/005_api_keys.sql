CREATE TYPE ak_environment_enum AS ENUM ('sandbox', 'production');
CREATE TYPE ak_tier_enum        AS ENUM ('free', 'starter', 'growth', 'enterprise');

CREATE TABLE api_keys (
  id                       UUID                NOT NULL DEFAULT gen_random_uuid(),
  platform_name            VARCHAR(255)        NOT NULL,
  platform_email           VARCHAR(255)        NOT NULL,
  api_key_hash             VARCHAR(64)         NOT NULL,
  api_key_prefix           VARCHAR(20)         NOT NULL,
  environment              ak_environment_enum NOT NULL DEFAULT 'sandbox',
  tier                     ak_tier_enum        NOT NULL DEFAULT 'free',
  verifications_this_month INTEGER             NOT NULL DEFAULT 0,
  monthly_limit            INTEGER             NOT NULL DEFAULT 100,
  is_active                BOOLEAN             NOT NULL DEFAULT true,
  last_used                TIMESTAMPTZ,
  permissions              JSONB               NOT NULL DEFAULT '["verify", "check", "trust"]',
  webhook_url              VARCHAR(2048),
  webhook_secret_hash      VARCHAR(64),
  created_at               TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (api_key_hash)
);

CREATE INDEX idx_ak_prefix         ON api_keys(api_key_prefix);
CREATE INDEX idx_ak_platform_email ON api_keys(platform_email);
CREATE INDEX idx_ak_environment    ON api_keys(environment);
CREATE INDEX idx_ak_active         ON api_keys(is_active) WHERE is_active = true;
