-- Migration 051: verification_sessions.redirect_url
-- The hosted flow (GET /v1/hosted/branding, /status) selects vs.redirect_url and POST /verify/initiate
-- accepts a redirect_url, but no migration ever created the column, so the hosted page failed on its
-- very first call ("column vs.redirect_url does not exist"). Create it; initiate now stores it.
ALTER TABLE verification_sessions ADD COLUMN IF NOT EXISTS redirect_url VARCHAR(2048);
