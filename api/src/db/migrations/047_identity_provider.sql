-- Migration 047: identity provider routing
-- Adds preferred_provider to api_keys so developers can pin to a specific provider.
-- Adds provider_used to verified_identities for audit trail.

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS preferred_provider TEXT
    CHECK (preferred_provider IN ('smile_identity', 'dojah', 'onfido'));

ALTER TABLE verified_identities
  ADD COLUMN IF NOT EXISTS provider_used TEXT
    CHECK (provider_used IN ('smile_identity', 'dojah', 'onfido'));
