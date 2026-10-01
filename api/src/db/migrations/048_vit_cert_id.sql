-- Migration 048: human-readable certificate ID on VIT records.
-- AVT-{level}-{year}-{8-digit-zero-padded-sequence} — generated at insert time.
ALTER TABLE verified_identity_tokens
  ADD COLUMN IF NOT EXISTS cert_id VARCHAR(32) UNIQUE;

-- Back-fill existing rows (level from identity, year from created_at, random suffix).
UPDATE verified_identity_tokens vit
SET cert_id = 'AVT-' ||
              vi.verification_level || '-' ||
              EXTRACT(YEAR FROM vit.created_at)::INT || '-' ||
              LPAD((FLOOR(RANDOM() * 99999999) + 1)::BIGINT::TEXT, 8, '0')
FROM verified_identities vi
WHERE vit.identity_id = vi.id
  AND vit.cert_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_vit_cert_id ON verified_identity_tokens(cert_id);
