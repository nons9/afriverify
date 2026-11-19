-- Who decided that a Verified Identity Token carries the person's name.
--   holder   : the person chose to include it when they created the token
--   platform : issued during a verification a platform ran (includes the name, as tokens always did before this change)
--   none     : the name is not in the token
-- Every token that exists today includes the name, so existing rows are 'platform'.
ALTER TABLE verified_identity_tokens
  ADD COLUMN IF NOT EXISTS name_sharing TEXT NOT NULL DEFAULT 'platform'
  CHECK (name_sharing IN ('holder', 'platform', 'none'));
