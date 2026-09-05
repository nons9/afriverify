-- KYB (business verification) audit trail. Added up front this time, in the
-- same migration as the feature that writes them, unlike the enum gap found
-- and fixed in migration 022.
ALTER TYPE ve_event_type_enum ADD VALUE 'kyb_registered';
ALTER TYPE ve_event_type_enum ADD VALUE 'kyb_document_uploaded';
ALTER TYPE ve_event_type_enum ADD VALUE 'kyb_director_linked';
ALTER TYPE ve_event_type_enum ADD VALUE 'kyb_verified';
ALTER TYPE ve_event_type_enum ADD VALUE 'kyb_rejected';

-- kyb_entities existed with no api_key_id, meaning there was no way to scope
-- a business verification to the platform that registered it, or to know
-- which platform's webhook to notify on a status change.
ALTER TABLE kyb_entities
  ADD COLUMN api_key_id       UUID REFERENCES api_keys(id),
  ADD COLUMN document_s3_key  VARCHAR(512),
  ADD COLUMN rejection_reason TEXT,
  ADD COLUMN updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX idx_kyb_api_key_id ON kyb_entities(api_key_id);

CREATE TRIGGER trg_kyb_updated_at
  BEFORE UPDATE ON kyb_entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- aml_screenings required identity_id (individuals only), so a business
-- itself could never be screened, only its directors one at a time.
ALTER TABLE aml_screenings
  ALTER COLUMN identity_id DROP NOT NULL,
  ADD COLUMN kyb_entity_id UUID REFERENCES kyb_entities(id),
  ADD CONSTRAINT chk_aml_exactly_one_subject
    CHECK ((identity_id IS NOT NULL) <> (kyb_entity_id IS NOT NULL));

CREATE INDEX idx_aml_kyb_entity_id ON aml_screenings(kyb_entity_id);
