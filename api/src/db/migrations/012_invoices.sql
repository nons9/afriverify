CREATE TYPE inv_status_enum AS ENUM ('draft', 'open', 'paid', 'void', 'uncollectible');

CREATE SEQUENCE invoice_number_seq START 1;

CREATE TABLE invoices (
  id                     UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id        UUID            NOT NULL REFERENCES subscriptions(id),
  api_key_id             UUID            NOT NULL REFERENCES api_keys(id),
  invoice_number         VARCHAR(30)     NOT NULL UNIQUE
                         DEFAULT ('OV-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('invoice_number_seq')::TEXT, 6, '0')),
  status                 inv_status_enum NOT NULL DEFAULT 'draft',
  amount_cents           INTEGER         NOT NULL DEFAULT 0,
  currency               VARCHAR(10)     NOT NULL DEFAULT 'USD',
  verifications_included INTEGER         NOT NULL DEFAULT 0,
  overage_verifications  INTEGER         NOT NULL DEFAULT 0,
  overage_amount_cents   INTEGER         NOT NULL DEFAULT 0,
  total_amount_cents     INTEGER         NOT NULL DEFAULT 0,
  payment_method         VARCHAR(100),
  payment_reference      VARCHAR(255),
  paid_at                TIMESTAMPTZ,
  due_at                 TIMESTAMPTZ     NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  period_start           TIMESTAMPTZ     NOT NULL,
  period_end             TIMESTAMPTZ     NOT NULL,
  pdf_url                VARCHAR(2048),
  created_at             TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inv_api_key_id      ON invoices(api_key_id);
CREATE INDEX idx_inv_subscription_id ON invoices(subscription_id);
CREATE INDEX idx_inv_status          ON invoices(status);
CREATE INDEX idx_inv_created_at      ON invoices(created_at DESC);
