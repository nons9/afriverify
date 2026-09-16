-- French language support: CNI id type, lang on sessions, country catalog.

-- 1. Add CNI (Carte Nationale d'Identité) to the id_type enum
ALTER TYPE id_type_enum ADD VALUE IF NOT EXISTS 'cni';

-- 2. Store preferred language on each verification session
ALTER TABLE verification_sessions
  ADD COLUMN IF NOT EXISTS lang VARCHAR(5) NOT NULL DEFAULT 'en';

-- 3. Francophone country catalog
CREATE TABLE francophone_countries (
  code            CHAR(2)      PRIMARY KEY,
  name_en         TEXT         NOT NULL,
  name_fr         TEXT         NOT NULL,
  id_type_label_en TEXT        NOT NULL,
  id_type_label_fr TEXT        NOT NULL,
  id_type         TEXT         NOT NULL DEFAULT 'cni',
  id_format_hint  TEXT,
  is_active       BOOLEAN      NOT NULL DEFAULT true
);

INSERT INTO francophone_countries
  (code, name_en, name_fr, id_type_label_en, id_type_label_fr, id_type, id_format_hint)
VALUES
  ('SN', 'Senegal',                    'Sénégal',                     'National ID Card',  'Carte Nationale d''Identité', 'cni',      NULL),
  ('CI', 'Côte d''Ivoire',             'Côte d''Ivoire',              'National ID Card',  'Carte Nationale d''Identité', 'cni',      NULL),
  ('CM', 'Cameroon',                   'Cameroun',                    'National ID Card',  'Carte Nationale d''Identité', 'cni',      NULL),
  ('ML', 'Mali',                       'Mali',                        'National ID Card',  'Carte Nationale d''Identité', 'cni',      NULL),
  ('BF', 'Burkina Faso',               'Burkina Faso',                'National ID Card',  'Carte Nationale d''Identité', 'cni',      NULL),
  ('NE', 'Niger',                      'Niger',                       'National ID Card',  'Carte Nationale d''Identité', 'cni',      NULL),
  ('GN', 'Guinea',                     'Guinée',                      'National ID Card',  'Carte Nationale d''Identité', 'cni',      NULL),
  ('TG', 'Togo',                       'Togo',                        'National ID Card',  'Carte Nationale d''Identité', 'cni',      NULL),
  ('BJ', 'Benin',                      'Bénin',                       'National ID Card',  'Carte Nationale d''Identité', 'cni',      NULL),
  ('GA', 'Gabon',                      'Gabon',                       'National ID Card',  'Carte Nationale d''Identité', 'cni',      NULL),
  ('CD', 'DR Congo',                   'RD Congo',                    'National ID Card',  'Carte Nationale d''Identité', 'cni',      NULL),
  ('CG', 'Republic of Congo',          'République du Congo',         'National ID Card',  'Carte Nationale d''Identité', 'cni',      NULL),
  ('MG', 'Madagascar',                 'Madagascar',                  'National ID Card',  'Carte Nationale d''Identité', 'cni',      NULL),
  ('RW', 'Rwanda',                     'Rwanda',                      'National ID Card',  'Carte Nationale d''Identité', 'cni',      NULL),
  ('MA', 'Morocco',                    'Maroc',                       'National ID Card',  'Carte Nationale d''Identité', 'cin',      NULL),
  ('TN', 'Tunisia',                    'Tunisie',                     'National ID Card',  'Carte Nationale d''Identité', 'cin',      NULL),
  ('DZ', 'Algeria',                    'Algérie',                     'National ID Card',  'Carte Nationale d''Identité', 'cin',      NULL),
  ('MR', 'Mauritania',                 'Mauritanie',                  'National ID Card',  'Carte Nationale d''Identité', 'cni',      NULL),
  ('GQ', 'Equatorial Guinea',          'Guinée Équatoriale',          'National ID Card',  'Carte Nationale d''Identité', 'cni',      NULL),
  ('CF', 'Central African Republic',   'République Centrafricaine',   'National ID Card',  'Carte Nationale d''Identité', 'cni',      NULL);

CREATE INDEX idx_fc_active ON francophone_countries(code) WHERE is_active = true;
