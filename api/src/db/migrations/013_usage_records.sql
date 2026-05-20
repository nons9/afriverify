CREATE TYPE ur_verification_type_enum AS ENUM ('level1', 'level2', 'level3', 'kyb', 'aml');

CREATE TABLE usage_records (
  id                UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id        UUID                       NOT NULL REFERENCES api_keys(id),
  subscription_id   UUID                       REFERENCES subscriptions(id),
  verification_type ur_verification_type_enum  NOT NULL,
  count             INTEGER                    NOT NULL DEFAULT 1,
  recorded_at       TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
  billing_period    VARCHAR(7)                 NOT NULL
);

CREATE INDEX idx_ur_api_key_id     ON usage_records(api_key_id);
CREATE INDEX idx_ur_billing_period ON usage_records(billing_period);
CREATE INDEX idx_ur_recorded_at    ON usage_records(recorded_at DESC);
