-- Migration 052: remove em-dashes from text seeded into the database.
-- Migration 044 originally seeded three risk-rule names with an em-dash (U+2014, chr(8212)). The product no
-- longer uses that character anywhere, so normalise the stored rows. Written with chr(8212), not the literal
-- character, so the repository-wide "no em-dash" check stays clean. Idempotent: a second run matches nothing.
UPDATE risk_rules
SET name        = replace(name,        ' ' || chr(8212) || ' ', ' - '),
    description = replace(description, ' ' || chr(8212) || ' ', ' - '),
    updated_at  = NOW()
WHERE name LIKE '%' || chr(8212) || '%'
   OR description LIKE '%' || chr(8212) || '%';
