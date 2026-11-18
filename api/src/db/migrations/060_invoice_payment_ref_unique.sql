-- Migration 060: one invoice per payment reference, enforced by the database as a last line of defence behind the
-- application's per-reference lock. Created only when no duplicates exist already: this migration must never fail
-- a deploy (migrations are fail-fast), so if historical duplicates are found it leaves the index alone and says so.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM invoices WHERE payment_tx_ref IS NOT NULL GROUP BY payment_tx_ref HAVING COUNT(*) > 1) THEN
    RAISE NOTICE 'invoices already contain duplicate payment_tx_ref values: unique index NOT created; clean them up, then add it by hand';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_payment_tx_ref ON invoices (payment_tx_ref) WHERE payment_tx_ref IS NOT NULL;
  END IF;
END $$;
