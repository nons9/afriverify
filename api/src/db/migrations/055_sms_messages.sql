-- Migration 055: one row per OTP SMS, so cost and delivery per provider can be measured.
-- No raw phone numbers: a SHA-256 hash plus a masked form. Append-only.
CREATE TABLE IF NOT EXISTS sms_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash   VARCHAR(64) NOT NULL,
  phone_masked VARCHAR(32) NOT NULL,
  country_code VARCHAR(4)  NOT NULL,
  provider     VARCHAR(32),            -- the provider that accepted it; NULL = every provider failed
  status       VARCHAR(8)  NOT NULL CHECK (status IN ('sent','failed')),
  attempts     JSONB       NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sms_created ON sms_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_provider ON sms_messages(provider, created_at DESC);
