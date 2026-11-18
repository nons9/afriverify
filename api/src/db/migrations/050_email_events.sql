-- Migration 050: email delivery events from Resend webhooks (bounces, complaints, failures).
-- No raw recipient addresses: a SHA-256 hash (for de-duplication / lookup) plus a masked form for humans.
-- APPEND-ONLY, like the other event tables.

CREATE TABLE IF NOT EXISTS email_events (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  svix_id          VARCHAR(100) NOT NULL UNIQUE,          -- webhook delivery id: makes retries idempotent
  resend_email_id  VARCHAR(100),
  event_type       VARCHAR(40)  NOT NULL,                 -- email.bounced | email.complained | email.failed | email.delivery_delayed | ...
  recipient_hash   VARCHAR(64),
  recipient_masked VARCHAR(255),
  subject          VARCHAR(255),                          -- e.g. "Your AfriVerify verification code" (no user data)
  bounce_type      VARCHAR(40),                           -- Permanent | Transient | Undetermined
  bounce_subtype   VARCHAR(60),
  reason           TEXT,                                  -- provider message, truncated
  occurred_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_events_type_time ON email_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_recipient ON email_events (recipient_hash) WHERE recipient_hash IS NOT NULL;

CREATE RULE no_update_email_events AS ON UPDATE TO email_events DO INSTEAD NOTHING;
CREATE RULE no_delete_email_events AS ON DELETE TO email_events DO INSTEAD NOTHING;
