-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE id_type_enum AS ENUM (
  'nin', 'bvn', 'passport', 'national_id', 'huduma', 'gid', 'unhcr'
);

CREATE TYPE trust_level_enum AS ENUM (
  'suspended', 'new', 'rising', 'verified', 'elite', 'sovereign'
);

CREATE TYPE aml_status_enum AS ENUM (
  'not_screened', 'pending', 'clear', 'flagged', 'blocked'
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE verified_identities (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  phone                VARCHAR(20)  NOT NULL UNIQUE,
  full_name            VARCHAR(255) NOT NULL DEFAULT '',
  nationality          VARCHAR(100) NOT NULL DEFAULT '',
  id_type              id_type_enum NOT NULL DEFAULT 'nin',
  id_number_hash       VARCHAR(64)  NOT NULL DEFAULT '',
  face_embedding       BYTEA,
  voice_print          BYTEA,
  device_fingerprints  JSONB        NOT NULL DEFAULT '[]',
  verification_level   INTEGER      NOT NULL DEFAULT 0 CHECK (verification_level >= 0 AND verification_level <= 5),
  trust_score          INTEGER      NOT NULL DEFAULT 100 CHECK (trust_score >= 0 AND trust_score <= 1000),
  trust_level          trust_level_enum NOT NULL DEFAULT 'new',
  is_blacklisted       BOOLEAN      NOT NULL DEFAULT false,
  blacklist_reason     TEXT,
  blacklist_scope      VARCHAR(20)  CHECK (blacklist_scope IN ('platform', 'global')),
  aml_status           aml_status_enum NOT NULL DEFAULT 'not_screened',
  is_pep               BOOLEAN      NOT NULL DEFAULT false,
  metadata             JSONB        NOT NULL DEFAULT '{}',
  last_active          TIMESTAMPTZ,
  verified_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vi_phone           ON verified_identities(phone);
CREATE INDEX idx_vi_trust_score     ON verified_identities(trust_score);
CREATE INDEX idx_vi_trust_level     ON verified_identities(trust_level);
CREATE INDEX idx_vi_blacklisted     ON verified_identities(is_blacklisted) WHERE is_blacklisted = true;
CREATE INDEX idx_vi_aml_status      ON verified_identities(aml_status);
CREATE INDEX idx_vi_level           ON verified_identities(verification_level);

CREATE TRIGGER trg_vi_updated_at
  BEFORE UPDATE ON verified_identities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
