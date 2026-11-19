-- The price we quoted when a checkout started. The payment is accepted only if the provider confirms at least
-- this amount in this currency, so a changed rate table or a tampered webhook cannot change what was agreed.
CREATE TABLE IF NOT EXISTS checkout_quotes (
  reference     TEXT PRIMARY KEY,
  api_key_id    UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  plan          TEXT NOT NULL,
  currency      TEXT NOT NULL,
  amount_minor  BIGINT NOT NULL CHECK (amount_minor > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
