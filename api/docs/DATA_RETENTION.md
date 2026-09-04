# Data Retention & Erasure

What AfriVerify stores about a verified individual, how long, and how a
platform can ask for it to be deleted. Written for NDPA (Nigeria) and GDPR
(EU) compliance, both of which apply the same core principles: collect only
what is needed, keep it only as long as it is needed, and honor a person's
request to erase it subject to a narrow set of exceptions.

## What is stored, and why

| Data | Where | Purpose |
|---|---|---|
| Phone number | `verified_identities.phone` | Primary identifier, OTP delivery |
| ID photo, selfie | Object storage (S3/R2), encrypted at rest (AES-256-GCM, application-side) | Biometric verification evidence |
| ID number | `verified_identities.id_number_hash` (SHA-256, never stored raw) | Duplicate-identity and blacklist checks |
| Full name, nationality, DOB | `verified_identities` | Identity record, required by KYC regulation |
| Face embedding, voice print | `verified_identities` (binary), when biometric verification runs | Re-verification without re-uploading photos |
| Verification/audit events | `verification_events` (append-only) | Compliance audit trail, fraud investigation |

## Retention windows

- **Incomplete verification attempts** (a session that failed a check, or
  was abandoned and expired before the user finished): the uploaded ID
  photo and selfie are deleted after `SESSION_MEDIA_RETENTION_DAYS` (default
  30 days). There is no ongoing purpose in keeping biometric images for an
  attempt that never became a verified identity. Enforced automatically by
  `src/services/retention.service.ts`, which runs once a day.
- **Completed verifications**: photos and identity records are kept for as
  long as the individual has an active relationship with a connected
  platform, plus the evidence-retention period KYC regulation typically
  expects (commonly 5 years after the relationship ends, though this varies
  by jurisdiction and the connected platform's own regulatory obligations).
  This is a business decision for AfriVerify's operators to set explicitly
  once real regulatory guidance is confirmed for the jurisdictions in use;
  nothing in this codebase currently auto-deletes a completed verification.
- **Audit events** (`verification_events`) are append-only by design (the
  table blocks `UPDATE`/`DELETE` at the database level) and are not deleted
  by either retention path above, since they are the compliance evidence
  that verification actually happened correctly.

## Right to erasure

A connected platform can request deletion of an individual's identifying
data via:

```
DELETE /v1/internal/users/:platformUserId
```

This deletes the individual's stored ID photo and selfie from object
storage and scrubs identifying fields on `verified_identities` (name,
nationality, ID number hash, phone, face embedding, voice print, device
fingerprints).

**What is kept, and why:** `is_blacklisted`, `blacklist_reason`,
`aml_status`, and `trust_score` are not cleared by an erasure request. Both
NDPA and GDPR recognize fraud prevention as a legitimate basis to retain a
minimal record after erasure. Otherwise an erasure request becomes a way
to launder a blacklisted identity back into eligibility by re-registering.
The retained record no longer carries anything identifying; it exists only
to prevent the row's fraud signals from evaporating along with the
person's PII.

The erasure itself is recorded as a `data_erased` audit event, since "this
identity was erased, by which platform, when" is itself compliance
evidence that needs to survive the erasure.

## What this does not yet cover

- No self-service erasure path for an individual who wants to request
  deletion directly from AfriVerify rather than through a connected
  platform.
- No automatic deletion of completed-verification evidence once a defined
  retention period elapses. That requires picking an actual retention
  period per jurisdiction, which is a legal/product decision, not an
  engineering one.
- No SOC 2 or equivalent third-party audit yet. Revisit once there are
  paying enterprise customers asking for one.
