-- Prepaid credit for identity-registry checks. A registry check calls a paid vendor (such as Smile ID), so the
-- cost is passed through: the customer tops up credit, each check that really runs takes its fee from it, and a
-- check that does not run is refunded. Amounts are US cents.
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS registry_balance_cents NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (registry_balance_cents >= 0);

ALTER TABLE verification_sessions
  ADD COLUMN IF NOT EXISTS registry_fee_cents NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS registry_fee_state TEXT NOT NULL DEFAULT 'none' CHECK (registry_fee_state IN ('none', 'charged', 'refunded'));

CREATE TABLE IF NOT EXISTS registry_ledger (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id     UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('topup', 'charge', 'refund')),
  amount_cents   NUMERIC(14,4) NOT NULL,          -- positive adds credit, negative uses it
  balance_after  NUMERIC(14,4) NOT NULL,
  reference      TEXT,                            -- payment reference for a top-up
  session_id     UUID,
  country        TEXT,
  id_type        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_registry_ledger_key ON registry_ledger (api_key_id, created_at DESC);
-- A payment can add credit only once, however many times its webhook is delivered.
CREATE UNIQUE INDEX IF NOT EXISTS uq_registry_ledger_topup_ref ON registry_ledger (reference) WHERE kind = 'topup';

-- A credit top-up stores the dollar amount it is for, next to the price that was quoted.
ALTER TABLE checkout_quotes ADD COLUMN IF NOT EXISTS usd_cents BIGINT;
