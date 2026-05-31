-- Migration 017: community_vouch
-- OrbitShield: CommunityVouch — African Community-Based Identity Verification
-- Users with Trust Score >= 600 vouch for people they personally know.
-- Three vouches from three unique vouchers = Level 2 upgrade (max via vouch path).
-- Vouchers put their own Trust Score at stake: -75 if vouched person commits fraud.
-- Mirrors traditional African communal accountability in a digital protocol.

CREATE TYPE vouch_status_enum AS ENUM ('active', 'revoked', 'expired');

CREATE TABLE IF NOT EXISTS community_vouches (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_identity_id         UUID NOT NULL REFERENCES verified_identities(id),
  vouched_identity_id         UUID NOT NULL REFERENCES verified_identities(id),
  relationship                VARCHAR(30) NOT NULL
    CHECK (relationship IN ('personal_acquaintance','business_partner','family','community_member')),
  statement                   TEXT NOT NULL CHECK (char_length(statement) BETWEEN 20 AND 500),
  voucher_trust_score_at_time INTEGER NOT NULL,
  status                      vouch_status_enum NOT NULL DEFAULT 'active',
  revoked_at                  TIMESTAMP WITH TIME ZONE,
  revoke_reason               TEXT,
  expires_at                  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '2 years'),
  created_at                  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT vouches_unique_pair UNIQUE (voucher_identity_id, vouched_identity_id)
);

CREATE INDEX IF NOT EXISTS idx_vouches_vouched_active
  ON community_vouches (vouched_identity_id, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_vouches_voucher_active
  ON community_vouches (voucher_identity_id, status)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS vouch_penalties (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vouch_id              UUID NOT NULL REFERENCES community_vouches(id),
  voucher_identity_id   UUID NOT NULL REFERENCES verified_identities(id),
  reason                TEXT NOT NULL,
  trust_score_penalty   INTEGER NOT NULL,
  applied_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vouch_penalties_voucher
  ON vouch_penalties (voucher_identity_id);
