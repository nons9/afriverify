-- Metering v2: how many billing units a session has been charged so far (1 = the phone check).
-- Lets each later step (ID check, face scan) be billed exactly once, even if retried.
ALTER TABLE verification_sessions ADD COLUMN IF NOT EXISTS billed_units INTEGER NOT NULL DEFAULT 1;
