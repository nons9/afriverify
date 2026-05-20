CREATE TYPE kyb_reg_type_enum AS ENUM ('cac_ng', 'brs_ke', 'cipc_za', 'cimc_gh', 'other');
CREATE TYPE kyb_status_enum   AS ENUM ('pending', 'verified', 'rejected', 'suspended');

CREATE TABLE kyb_entities (
  id                    UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name         VARCHAR(255)      NOT NULL,
  registration_number   VARCHAR(100)      NOT NULL,
  registration_country  VARCHAR(10)       NOT NULL,
  registration_type     kyb_reg_type_enum NOT NULL,
  director_identity_ids JSONB             NOT NULL DEFAULT '[]',
  business_address      JSONB,
  verification_status   kyb_status_enum   NOT NULL DEFAULT 'pending',
  verification_level    INTEGER           NOT NULL DEFAULT 0,
  trust_score           INTEGER           NOT NULL DEFAULT 100,
  verified_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kyb_business_name      ON kyb_entities(business_name);
CREATE INDEX idx_kyb_registration_number ON kyb_entities(registration_number);
CREATE INDEX idx_kyb_status             ON kyb_entities(verification_status);
