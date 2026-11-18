-- Migration 061: one secret per API key for the USSD callback URL. The aggregator cannot sign its callbacks and the
-- endpoint is public, so without a secret anyone who knows a short code could mark any phone number verified.
-- Only a SHA-256 hash is stored; the secret itself is shown to the key's owner once. Keys that already have a short
-- code have NO secret yet, so their callbacks are refused until the owner generates one (fail closed).
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS ussd_callback_secret_hash VARCHAR(64);
