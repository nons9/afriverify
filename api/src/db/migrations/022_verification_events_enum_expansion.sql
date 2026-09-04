-- These event_type values are already written by application code
-- (community-vouch.service.ts, internal.ts, verify.ts) but were never added
-- to ve_event_type_enum, so every one of these writeAuditEvent() calls has
-- been silently failing since it was introduced: the insert raises an
-- invalid-enum-value error, writeAuditEvent's catch block logs
-- "Audit write failed" and swallows it, and the caller never sees a
-- failure. Community vouching, VIT issuance, cross-platform linking,
-- fraud signals, and status checks have had no audit trail at all.
ALTER TYPE ve_event_type_enum ADD VALUE 'community_vouched';
ALTER TYPE ve_event_type_enum ADD VALUE 'vouched_for_fraudster';
ALTER TYPE ve_event_type_enum ADD VALUE 'vouch_submitted';
ALTER TYPE ve_event_type_enum ADD VALUE 'fraud_signal';
ALTER TYPE ve_event_type_enum ADD VALUE 'initial_verification';
ALTER TYPE ve_event_type_enum ADD VALUE 'status_check';
ALTER TYPE ve_event_type_enum ADD VALUE 'vit_issued';

-- 'platform_connection' (internal.ts) was a typo of the existing
-- 'platform_connected' (identity.ts) -- fixed at the call site instead of
-- adding a near-duplicate enum value.

-- New: right-to-erasure requests (NDPA/GDPR deletion-on-request).
ALTER TYPE ve_event_type_enum ADD VALUE 'data_erased';
