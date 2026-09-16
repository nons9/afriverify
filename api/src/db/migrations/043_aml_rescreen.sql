-- Track when an individual identity was last AML screened so the re-screen
-- worker can efficiently query only stale records.
ALTER TABLE verified_identities
  ADD COLUMN IF NOT EXISTS last_screened_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_vi_aml_rescreen
  ON verified_identities (last_screened_at ASC NULLS FIRST)
  WHERE full_name IS NOT NULL AND full_name != '';
