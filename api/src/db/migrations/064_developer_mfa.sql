-- Two-step verification (TOTP) for dashboard accounts.
--  mfa_secret_enc          the authenticator secret, encrypted with the platform data key (never stored in clear)
--  mfa_pending_secret_enc  a secret shown during setup, not active until the person proves they can generate a code
--  mfa_enabled_at          set when two-step verification is on
--  mfa_last_step           the last accepted 30-second step, so one code cannot be used twice
--  mfa_recovery_hashes     SHA-256 hashes of single-use recovery codes
ALTER TABLE developers
  ADD COLUMN IF NOT EXISTS mfa_secret_enc         TEXT,
  ADD COLUMN IF NOT EXISTS mfa_pending_secret_enc TEXT,
  ADD COLUMN IF NOT EXISTS mfa_enabled_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mfa_last_step          BIGINT,
  ADD COLUMN IF NOT EXISTS mfa_recovery_hashes    JSONB NOT NULL DEFAULT '[]'::jsonb;
