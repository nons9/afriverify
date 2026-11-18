-- Migration 054: link a verification session to the inquiry link that created it,
-- so the hosted flow can enforce the link's allowed ID types and the dashboard
-- can read each submission's outcome from the session itself.
ALTER TABLE verification_sessions
  ADD COLUMN IF NOT EXISTS inquiry_id UUID REFERENCES inquiry_links(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_vs_inquiry_id ON verification_sessions(inquiry_id) WHERE inquiry_id IS NOT NULL;
