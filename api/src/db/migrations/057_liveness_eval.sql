-- Migration 057: liveness evaluation program. Consented capture of real people and attacks, labelled with
-- ground truth, so false-accept / false-reject rates can be MEASURED (ISO/IEC 30107-3 style APCER / BPCER),
-- per attack type, skin tone, lighting and device. Participants are pseudonymous (a code, no name or contact);
-- frames are encrypted in object storage and purged on a schedule or on withdrawal.

CREATE TABLE IF NOT EXISTS liveness_eval_studies (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_email TEXT         NOT NULL,
  name            VARCHAR(120) NOT NULL,
  purpose         TEXT         NOT NULL,
  retention_days  INTEGER      NOT NULL DEFAULT 180 CHECK (retention_days BETWEEN 7 AND 730),
  status          VARCHAR(8)   NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lev_studies_dev ON liveness_eval_studies(developer_email, created_at DESC);

CREATE TABLE IF NOT EXISTS liveness_eval_participants (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id             UUID        NOT NULL REFERENCES liveness_eval_studies(id) ON DELETE CASCADE,
  code                 VARCHAR(12) NOT NULL,                       -- P-0001: the only identifier; no name, phone or email is stored
  age_band             VARCHAR(8)  CHECK (age_band IN ('18-24','25-34','35-44','45-54','55+')),
  gender               VARCHAR(16) CHECK (gender IN ('female','male','other','undisclosed')),
  skin_tone            SMALLINT    CHECK (skin_tone BETWEEN 1 AND 10),  -- Monk Skin Tone scale
  country              VARCHAR(2),
  consent_version      VARCHAR(32) NOT NULL,
  consent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consent_confirmed_by TEXT        NOT NULL,                       -- the operator who obtained informed consent
  withdrawn_at         TIMESTAMPTZ,
  UNIQUE (study_id, code)
);

CREATE TABLE IF NOT EXISTS liveness_eval_captures (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id          UUID         NOT NULL REFERENCES liveness_eval_studies(id) ON DELETE CASCADE,
  participant_id    UUID         NOT NULL REFERENCES liveness_eval_participants(id) ON DELETE CASCADE,
  label             VARCHAR(8)   NOT NULL CHECK (label IN ('genuine','attack')),   -- ground truth, set by the operator
  attack_type       VARCHAR(24)  CHECK (attack_type IN ('print_photo','screen_photo','screen_video','screen_live_video','mask','other')),
  lighting          VARCHAR(16)  NOT NULL CHECK (lighting IN ('indoor_bright','indoor_dim','outdoor_shade','outdoor_sun')),
  device            VARCHAR(80),
  verdict           VARCHAR(8)   NOT NULL CHECK (verdict IN ('pass','review','fail')),
  liveness_score    NUMERIC(5,1),
  passive_score     NUMERIC(5,4),
  challenges_passed SMALLINT,
  challenges_total  SMALLINT,
  flash_verdict     VARCHAR(14),
  flash_correlation NUMERIC(6,3),
  flash_p_value     NUMERIC(7,4),
  flash_effect      NUMERIC(7,2),
  flash_bg_ratio    NUMERIC(6,3),
  flags             JSONB        NOT NULL DEFAULT '[]',
  reasons           JSONB        NOT NULL DEFAULT '[]',
  engine_version    VARCHAR(32),
  frame_count       INTEGER      NOT NULL DEFAULT 0,
  frame_s3_keys     JSONB        NOT NULL DEFAULT '[]',
  created_by        TEXT         NOT NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  purge_after       TIMESTAMPTZ  NOT NULL,
  purged_at         TIMESTAMPTZ,
  CONSTRAINT lev_attack_type_matches_label CHECK (
    (label = 'genuine' AND attack_type IS NULL) OR (label = 'attack' AND attack_type IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_lev_captures_study ON liveness_eval_captures(study_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lev_captures_purge ON liveness_eval_captures(purge_after) WHERE purged_at IS NULL;
