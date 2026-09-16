-- No-code flow builder: developer-configured verification journey templates.
-- Developers create flows that specify which steps are required, which ID types
-- are accepted, country restrictions, and branding for the hosted widget.
CREATE TABLE verification_flows (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_email        TEXT         NOT NULL,
  name                   TEXT         NOT NULL,
  description            TEXT,
  -- Steps included in this flow
  required_steps         TEXT[]       NOT NULL DEFAULT '{phone,otp}',
  optional_steps         TEXT[]       NOT NULL DEFAULT '{id_upload,face_scan}',
  -- Accepted document types (null = all)
  allowed_id_types       TEXT[]       NOT NULL DEFAULT '{national_id,passport,drivers_license}',
  -- Country allow-list using ISO 3166-1 alpha-2 codes (null = all countries)
  allowed_countries      TEXT[],
  -- Minimum verification level before the flow completes successfully
  min_verification_level INTEGER      NOT NULL DEFAULT 1,
  -- Hosted widget redirect targets
  success_url            TEXT,
  failure_url            TEXT,
  -- Custom branding for the hosted verification widget
  brand_name             TEXT,
  brand_color            TEXT         DEFAULT '#6366f1',
  welcome_message        TEXT,
  -- Lifecycle
  is_active              BOOLEAN      NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_flows_email  ON verification_flows(developer_email);
CREATE INDEX idx_flows_active ON verification_flows(developer_email) WHERE is_active = true;

-- Attach an optional flow template to each verification session so the
-- widget and status endpoint can return the correct configuration.
ALTER TABLE verification_sessions
  ADD COLUMN IF NOT EXISTS flow_id UUID REFERENCES verification_flows(id) ON DELETE SET NULL;

CREATE INDEX idx_sessions_flow ON verification_sessions(flow_id) WHERE flow_id IS NOT NULL;
