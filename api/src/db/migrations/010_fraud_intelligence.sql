CREATE TYPE fi_target_type_enum AS ENUM ('identity', 'device', 'phone', 'ip', 'face');
CREATE TYPE fi_fraud_type_enum  AS ENUM (
  'fake_identity', 'impersonation', 'deepfake', 'stolen_id',
  'multiple_accounts', 'scam_network', 'financial_fraud', 'other'
);

CREATE TABLE fraud_intelligence_reports (
  id                    UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  reporting_platform    VARCHAR(255)        NOT NULL,
  target_type           fi_target_type_enum NOT NULL,
  target_hash           VARCHAR(64)         NOT NULL,
  fraud_type            fi_fraud_type_enum  NOT NULL,
  evidence_summary      TEXT,
  confidence_score      FLOAT               CHECK (confidence_score >= 0 AND confidence_score <= 1),
  is_confirmed          BOOLEAN             NOT NULL DEFAULT false,
  confirmed_by          VARCHAR(255),
  shared_with_platforms JSONB               NOT NULL DEFAULT '[]',
  created_at            TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fi_target_hash        ON fraud_intelligence_reports(target_hash);
CREATE INDEX idx_fi_target_type        ON fraud_intelligence_reports(target_type);
CREATE INDEX idx_fi_confirmed          ON fraud_intelligence_reports(is_confirmed);
CREATE INDEX idx_fi_reporting_platform ON fraud_intelligence_reports(reporting_platform);
