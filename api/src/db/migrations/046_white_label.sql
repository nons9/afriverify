-- White-label branding configuration per developer account.
-- Keyed by platform_email (developer email) so a single brand applies
-- across all API keys belonging to the same developer.

CREATE TABLE IF NOT EXISTS white_label_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_email TEXT NOT NULL UNIQUE,
  company_name    TEXT NOT NULL DEFAULT '',
  logo_url        TEXT,
  primary_color   TEXT NOT NULL DEFAULT '#4F46E5',
  button_color    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_white_label_configs_developer_email
  ON white_label_configs (developer_email);
