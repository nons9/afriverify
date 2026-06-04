-- Platform integration: link verification sessions to platform user IDs,
-- create platform_connections on completion, log webhook deliveries.

-- platform_user_id: the user's ID on the calling platform (e.g. ScoutAfrika userId)
-- Stored at session start so it's available when verification completes.
ALTER TABLE verification_sessions
  ADD COLUMN IF NOT EXISTS platform_user_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_vs_platform_user
  ON verification_sessions(platform_user_id)
  WHERE platform_user_id IS NOT NULL;

-- Webhook delivery log — APPEND-ONLY, every push attempt is a permanent record
CREATE TABLE platform_webhook_deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id       UUID NOT NULL REFERENCES api_keys(id),
  identity_id      UUID REFERENCES verified_identities(id),
  platform_user_id VARCHAR(255),
  event_type       VARCHAR(80) NOT NULL,
  payload          JSONB NOT NULL,
  webhook_url      VARCHAR(2048) NOT NULL,
  http_status      INTEGER,
  response_body    TEXT,
  success          BOOLEAN NOT NULL DEFAULT false,
  attempt_number   INTEGER NOT NULL DEFAULT 1,
  delivered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE RULE platform_webhook_deliveries_no_update AS
  ON UPDATE TO platform_webhook_deliveries DO INSTEAD NOTHING;
CREATE RULE platform_webhook_deliveries_no_delete AS
  ON DELETE TO platform_webhook_deliveries DO INSTEAD NOTHING;

CREATE INDEX idx_pwd_api_key    ON platform_webhook_deliveries(api_key_id, delivered_at DESC);
CREATE INDEX idx_pwd_identity   ON platform_webhook_deliveries(identity_id, delivered_at DESC);
CREATE INDEX idx_pwd_platform   ON platform_webhook_deliveries(platform_user_id) WHERE platform_user_id IS NOT NULL;
