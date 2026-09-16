-- Human-review queue (Sumsub/Persona-style case management)
CREATE TYPE case_status_enum   AS ENUM ('open', 'under_review', 'approved', 'rejected', 'escalated');
CREATE TYPE case_priority_enum AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TABLE review_cases (
  id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  case_ref        TEXT                NOT NULL UNIQUE DEFAULT 'CASE-' || upper(substr(gen_random_uuid()::text, 1, 8)),
  identity_id     UUID                REFERENCES verified_identities(id) ON DELETE SET NULL,
  session_id      UUID                REFERENCES verification_sessions(id) ON DELETE SET NULL,
  api_key_id      UUID                REFERENCES api_keys(id) ON DELETE SET NULL,
  developer_email TEXT                NOT NULL,
  reason          TEXT                NOT NULL,
  status          case_status_enum    NOT NULL DEFAULT 'open',
  priority        case_priority_enum  NOT NULL DEFAULT 'medium',
  assignee        TEXT,
  resolution_note TEXT,
  resolved_by     TEXT,
  resolved_at     TIMESTAMPTZ,
  metadata        JSONB               NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE TABLE case_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID        NOT NULL REFERENCES review_cases(id) ON DELETE CASCADE,
  actor       TEXT        NOT NULL,
  action      TEXT        NOT NULL,
  body        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rc_identity_id     ON review_cases(identity_id);
CREATE INDEX idx_rc_developer_email ON review_cases(developer_email);
CREATE INDEX idx_rc_status          ON review_cases(status);
CREATE INDEX idx_rc_priority        ON review_cases(priority);
CREATE INDEX idx_rc_created_at      ON review_cases(created_at DESC);
CREATE INDEX idx_ce_case_id         ON case_events(case_id);
