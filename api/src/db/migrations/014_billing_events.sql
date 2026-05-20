CREATE TABLE billing_events (
  id           UUID         NOT NULL DEFAULT gen_random_uuid(),
  api_key_id   UUID         NOT NULL REFERENCES api_keys(id),
  event_type   VARCHAR(100) NOT NULL,
  amount_cents INTEGER,
  currency     VARCHAR(10),
  metadata     JSONB        NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- Append-only
CREATE RULE no_update_billing_events
  AS ON UPDATE TO billing_events DO INSTEAD NOTHING;
CREATE RULE no_delete_billing_events
  AS ON DELETE TO billing_events DO INSTEAD NOTHING;

CREATE INDEX idx_be_api_key_id ON billing_events(api_key_id);
CREATE INDEX idx_be_event_type ON billing_events(event_type);
CREATE INDEX idx_be_created_at ON billing_events(created_at DESC);
