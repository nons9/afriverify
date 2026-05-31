CREATE TYPE aml_screening_type_enum AS ENUM ('sanctions', 'pep', 'adverse_media', 'watchlist');
CREATE TYPE aml_result_enum        AS ENUM ('clear', 'flagged', 'blocked');

CREATE TABLE aml_screenings (
  id             UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id    UUID                    NOT NULL REFERENCES verified_identities(id),
  screening_type aml_screening_type_enum NOT NULL,
  result         aml_result_enum         NOT NULL,
  match_details  JSONB,
  screened_by    VARCHAR(255),
  screened_at    TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ
);

CREATE INDEX idx_aml_identity_id ON aml_screenings(identity_id);
CREATE INDEX idx_aml_result      ON aml_screenings(result);
CREATE INDEX idx_aml_screened_at ON aml_screenings(screened_at DESC);
