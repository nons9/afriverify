-- Migration 015: live_ledger
-- OrbitShield: LiveLedger — Verification Continuity Protocol
-- Records every identity access with device/IP context.
-- Used to compute a continuity_score returned alongside every /identity/check response.
-- APPEND-ONLY — no updates, no deletes, ever.

CREATE TABLE IF NOT EXISTS live_ledger (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id             UUID NOT NULL REFERENCES verified_identities(id),
  platform_name           VARCHAR(100) NOT NULL,
  ip_geohash              VARCHAR(16),          -- SHA-256 prefix of first two IP octets (region-level only)
  device_fingerprint_hash VARCHAR(64),          -- SHA-256 of device ID header
  user_agent_hash         VARCHAR(64),          -- SHA-256 of user-agent
  continuity_score        INTEGER NOT NULL DEFAULT 100 CHECK (continuity_score BETWEEN 0 AND 100),
  anomaly_flags           JSONB NOT NULL DEFAULT '[]',
  created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_ledger_identity_recent
  ON live_ledger (identity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_ledger_device
  ON live_ledger (device_fingerprint_hash)
  WHERE device_fingerprint_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_live_ledger_ip
  ON live_ledger (ip_geohash)
  WHERE ip_geohash IS NOT NULL;

-- APPEND-ONLY enforcement
CREATE RULE no_update_live_ledger AS ON UPDATE TO live_ledger DO INSTEAD NOTHING;
CREATE RULE no_delete_live_ledger AS ON DELETE TO live_ledger DO INSTEAD NOTHING;
