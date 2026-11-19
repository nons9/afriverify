-- How far a session has been billed: 1 phone, 2 ID check (a registry check really ran), 3 face scan.
-- Needed because a face scan with no ID check bills 3 units, the same total as phone + ID, so the unit count
-- alone cannot say which steps were charged.
ALTER TABLE verification_sessions ADD COLUMN IF NOT EXISTS billed_rank SMALLINT NOT NULL DEFAULT 0;
