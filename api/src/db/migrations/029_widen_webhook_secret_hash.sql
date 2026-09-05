-- webhook_secret_hash was sized for a bare 64-char hex secret. Once the
-- security-hardening pass started encrypting it at rest (AES-256-GCM, then
-- base64-encoded) the stored value got longer than that, and nothing widened
-- the column to match - every attempt to regenerate a webhook secret since
-- then has failed with "value too long for type character varying(64)".
-- TEXT instead of a guessed fixed width so this doesn't recur if the
-- encryption format's overhead ever changes again.
ALTER TABLE api_keys ALTER COLUMN webhook_secret_hash TYPE TEXT;
