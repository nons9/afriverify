CREATE TABLE trust_events (
  id           UUID         NOT NULL DEFAULT gen_random_uuid(),
  identity_id  UUID         NOT NULL REFERENCES verified_identities(id),
  event_type   VARCHAR(100) NOT NULL,
  platform     VARCHAR(255),
  score_delta  INTEGER      NOT NULL,
  score_after  INTEGER      NOT NULL,
  reference_id UUID,
  notes        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- Append-only
CREATE RULE no_update_trust_events
  AS ON UPDATE TO trust_events DO INSTEAD NOTHING;
CREATE RULE no_delete_trust_events
  AS ON DELETE TO trust_events DO INSTEAD NOTHING;

CREATE INDEX idx_te_identity_id ON trust_events(identity_id);
CREATE INDEX idx_te_created_at  ON trust_events(created_at DESC);
CREATE INDEX idx_te_platform    ON trust_events(platform);
