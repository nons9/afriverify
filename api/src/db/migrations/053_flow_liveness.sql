-- Migration 053: per-flow "require live scan" setting.
-- A verification flow (the developer's no-code journey template) can now require the live face scan.
-- Sessions created with that flow get liveness_required = true, so the plain photo upload is refused for them.
ALTER TABLE verification_flows
  ADD COLUMN IF NOT EXISTS require_liveness BOOLEAN NOT NULL DEFAULT false;
