CREATE TYPE sub_plan_enum             AS ENUM ('free', 'starter', 'growth', 'enterprise', 'pay_per_use');
CREATE TYPE sub_status_enum           AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'paused');
CREATE TYPE sub_billing_cycle_enum    AS ENUM ('monthly', 'annual');
CREATE TYPE sub_payment_provider_enum AS ENUM (
  'paystack', 'flutterwave', 'mtn_momo', 'fincra', 'wise', 'swift', 'crypto', 'manual'
);

CREATE TABLE subscriptions (
  id                       UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id               UUID                      NOT NULL REFERENCES api_keys(id),
  plan                     sub_plan_enum             NOT NULL DEFAULT 'free',
  status                   sub_status_enum           NOT NULL DEFAULT 'trialing',
  billing_cycle            sub_billing_cycle_enum    NOT NULL DEFAULT 'monthly',
  amount_cents             INTEGER                   NOT NULL DEFAULT 0,
  currency                 VARCHAR(10)               NOT NULL DEFAULT 'USD',
  payment_provider         sub_payment_provider_enum,
  provider_subscription_id VARCHAR(255),
  trial_ends_at            TIMESTAMPTZ,
  current_period_start     TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  current_period_end       TIMESTAMPTZ               NOT NULL DEFAULT (NOW() + INTERVAL '1 month'),
  cancel_at_period_end     BOOLEAN                   NOT NULL DEFAULT false,
  cancelled_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ               NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sub_api_key_id ON subscriptions(api_key_id);
CREATE INDEX idx_sub_status     ON subscriptions(status);
CREATE INDEX idx_sub_plan       ON subscriptions(plan);

CREATE TRIGGER trg_sub_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
