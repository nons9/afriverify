-- Wires up the subscriptions/invoices/usage_records/billing_events schema
-- (migrations 011-014), which shipped with no service or route code ever
-- touching it - the same "schema exists, nothing wired up" gap already found
-- and fixed for kyb_entities (023) and Niloticus's orbit_verify_id column.

-- 'paystack' was listed as a valid payment provider before Paystack was
-- permanently removed from this project. Postgres can't drop a single enum
-- value directly, so recreate the type without it.
ALTER TABLE subscriptions ALTER COLUMN payment_provider DROP DEFAULT;
ALTER TYPE sub_payment_provider_enum RENAME TO sub_payment_provider_enum_old;
CREATE TYPE sub_payment_provider_enum AS ENUM ('flutterwave', 'manual');
ALTER TABLE subscriptions
  ALTER COLUMN payment_provider TYPE sub_payment_provider_enum
  USING (
    CASE payment_provider::text
      WHEN 'paystack' THEN 'flutterwave' -- no rows expected; safe fallback if any exist
      WHEN 'flutterwave' THEN 'flutterwave'
      ELSE 'manual'
    END
  )::sub_payment_provider_enum;
DROP TYPE sub_payment_provider_enum_old;

-- Invoice numbers were still prefixed "OV-" (OrbitVerify, the pre-rename
-- product name). New invoices should read "AV-" like everything else
-- AfriVerify-branded; existing invoice numbers (there are none in production
-- yet - this table has never been written to) are left as-is since renaming
-- an already-issued invoice number would be a real accounting change, not a
-- cosmetic one.
ALTER TABLE invoices
  ALTER COLUMN invoice_number
  SET DEFAULT ('AV-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('invoice_number_seq')::TEXT, 6, '0'));

-- Flutterwave transaction/checkout reference for the specific charge that
-- created or renewed a subscription, and the checkout reference used to pay
-- an invoice - needed to reconcile webhook callbacks back to a row.
ALTER TABLE subscriptions ADD COLUMN provider_reference VARCHAR(255);
ALTER TABLE invoices      ADD COLUMN payment_tx_ref     VARCHAR(255);

CREATE INDEX idx_sub_provider_reference ON subscriptions(provider_reference);
CREATE INDEX idx_inv_payment_tx_ref     ON invoices(payment_tx_ref);

-- verifications_this_month has counted up since the key was created with no
-- reset mechanism at all - once a free-tier key hit its limit it stayed
-- blocked forever. usage_period_start marks when the current counting
-- window began so the billing cron can roll it over monthly.
ALTER TABLE api_keys ADD COLUMN usage_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW();
