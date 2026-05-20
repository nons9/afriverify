CREATE TYPE bl_type_enum  AS ENUM ('face_hash', 'device_id', 'phone', 'ip_range', 'id_number_hash');
CREATE TYPE bl_scope_enum AS ENUM ('platform', 'global');

CREATE TABLE blacklist (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id          UUID          REFERENCES verified_identities(id) ON DELETE SET NULL,
  type                 bl_type_enum  NOT NULL,
  value                VARCHAR(64)   NOT NULL,
  reason               TEXT          NOT NULL,
  scope                bl_scope_enum NOT NULL DEFAULT 'platform',
  reported_by_platform VARCHAR(255),
  confirmed_at         TIMESTAMPTZ,
  added_by             VARCHAR(255),
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bl_value       ON blacklist(value);
CREATE INDEX idx_bl_type        ON blacklist(type);
CREATE INDEX idx_bl_scope       ON blacklist(scope);
CREATE INDEX idx_bl_identity_id ON blacklist(identity_id);
