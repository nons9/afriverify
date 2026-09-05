-- kyb_entities.api_key_id (added in 023) ties a business verification to a
-- single platform, so two platforms verifying the exact same real business
-- would each register a brand-new kyb_entities row and each redo document
-- upload, director linking, and screening from scratch. Individuals already
-- avoid this via platform_connections (see verify.ts's phone-number lookup
-- before starting a fresh verification session) - businesses had no
-- equivalent. This migration brings KYB in line with that model.

-- New audit event for when a platform links to an already-existing, already
-- KYB'd entity rather than registering a brand-new one.
ALTER TYPE ve_event_type_enum ADD VALUE 'kyb_linked';

CREATE TABLE kyb_connections (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  kyb_entity_id       UUID         NOT NULL REFERENCES kyb_entities(id) ON DELETE CASCADE,
  platform_name       VARCHAR(255) NOT NULL,
  platform_api_key_id UUID         NOT NULL REFERENCES api_keys(id),
  connected_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_verified       TIMESTAMPTZ,
  is_active           BOOLEAN      NOT NULL DEFAULT true,
  UNIQUE(kyb_entity_id, platform_api_key_id)
);

CREATE INDEX idx_kybc_kyb_entity_id  ON kyb_connections(kyb_entity_id);
CREATE INDEX idx_kybc_api_key_id     ON kyb_connections(platform_api_key_id);
CREATE INDEX idx_kybc_active         ON kyb_connections(is_active) WHERE is_active = true;

-- Backfill: every existing kyb_entities row already implies exactly one
-- connection to the platform that originally registered it.
INSERT INTO kyb_connections (kyb_entity_id, platform_name, platform_api_key_id, connected_at, last_verified)
SELECT ke.id, ak.platform_name, ke.api_key_id, ke.created_at, ke.created_at
FROM kyb_entities ke
JOIN api_keys ak ON ak.id = ke.api_key_id
WHERE ke.api_key_id IS NOT NULL;

-- Natural dedup key: a registration number is only meaningful within one
-- country's registry and one registration type. Without this, two platforms
-- registering the same business at the same moment could each insert a
-- separate row before either sees the other's data.
ALTER TABLE kyb_entities
  ADD CONSTRAINT uq_kyb_entities_registration
  UNIQUE (registration_number, registration_country, registration_type);
