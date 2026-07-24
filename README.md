# AfriVerify

Africa's identity infrastructure layer. One verified African identity — portable across every platform.

## Phase 1 MVP

This repo contains the production-ready API backend for Phase 1:

- All 14 PostgreSQL tables with indexes and append-only enforcement
- Phone OTP verification (Twilio primary, Termii fallback)
- Government ID verification via Smile Identity (54 African countries)
- Biometric face match (Smile Identity KYC)
- Verified Identity Token (VIT) — RS256-signed JWT, portable across platforms
- Platform connection and identity check endpoints
- Trust Score engine — real-time, cross-platform
- Fraud intelligence flagging
- API key management with per-key rate limiting
- Zero raw ID data in DB — all hashed (SHA-256)
- Append-only audit trail (verification_events, trust_events, billing_events)

## Stack

- **Runtime**: Node.js + TypeScript + Express
- **Database**: PostgreSQL
- **Cache / Rate limiting**: Redis (ioredis)
- **ID Verification**: Smile Identity
- **OTP**: Twilio Verify + Termii fallback
- **Storage**: AWS S3 (af-south-1, KMS-encrypted)
- **VIT signing**: RS256 (jsonwebtoken)

## Setup

```bash
cd api
npm install
cp .env.example .env   # fill in all values
npm run migrate        # run all 14 migrations
npm run dev            # starts on port 3000
```

## Key endpoints

```
POST /v1/verify/initiate          Start verification session
POST /v1/verify/otp/send          Send OTP
POST /v1/verify/otp/confirm       Confirm OTP
POST /v1/verify/id/upload         Upload government ID
POST /v1/verify/face/submit       Submit selfie for biometric match
GET  /v1/verify/status/:token     Poll verification status → returns VIT when complete

GET  /v1/identity/check?phone=    Sub-100ms identity lookup
POST /v1/identity/connect         Connect verified identity to your platform
GET  /v1/identity/profile/:id     Full identity profile
POST /v1/identity/flag            Report fraud

GET  /v1/trust/:identity_id       Get trust score and history
POST /v1/trust/update             Post a trust event

POST /v1/developer/keys           Create API key (shown once)
GET  /v1/developer/usage          Usage stats for current key

GET  /v1/afrishield/continuity/:id   Identity continuity history
GET  /v1/afrishield/fraud-graph/:id  Network fraud risk
GET  /v1/afrishield/vouch/:id        Community vouch status
GET  /v1/afrishield/deepscan/:id     DeepScan history

GET  /health                      Health check
```

## Auth

Every request requires:
```
Authorization: Bearer av_test_<key>
X-Platform: your-platform-name
Content-Type: application/json
```

## VIT structure

The Verified Identity Token is a signed RS256 JWT. Platforms receive only the VIT — never raw ID data, never face embeddings.

```json
{
  "vit": "av_vit_abc123",
  "verified": true,
  "level": 2,
  "name": "Verified Name",
  "nationality": "Nigerian",
  "id_type": "nin",
  "verification_method": "biometric",
  "trust_score": 350,
  "trust_level": "rising",
  "issued_at": "2026-05-20T10:00:00Z",
  "expires_at": "2027-05-20T10:00:00Z",
  "platforms_verified_on": ["scoutafrika"],
  "flags": [],
  "aml_clear": true,
  "is_pep": false,
  "kyb_linked": null
}
```

## Security rules in force from day one

- Raw ID numbers never stored — SHA-256 hashed only
- API keys never stored plain — SHA-256 hashed, shown once at creation
- Face embeddings encrypted at rest (AES-256-GCM), never returned by any API
- verification_events and trust_events tables are append-only (PostgreSQL RULE enforcement)
- Sessions expire in 15 minutes; OTPs in 5 minutes with max 3 attempts
- 10 verification initiations per phone per 24 hours
- S3 buckets: private only, pre-signed URLs (5-minute expiry), 30-day auto-delete lifecycle
- Rate limiting: per-IP global, per-API-key per-minute, per-phone per-day
