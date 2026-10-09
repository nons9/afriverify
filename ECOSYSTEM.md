# AfriVerify Ecosystem Architecture

## Strategic Vision

**One trusted identity. Infinite possibilities.**

AfriVerify is the **identity and trust layer** powering an interconnected ecosystem of African commerce, creator, fintech, and logistics platforms. Each product vertical depends on a single, portable verified identity.

---

## Ecosystem Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     CORE PLATFORM LAYER                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  AfriVerify (Identity & Trust)                           │   │
│  │  ├─ Verified Identity Tokens (VIT)                       │   │
│  │  ├─ Trust Score Engine (0-1000, cross-platform)         │   │
│  │  ├─ KYC/AML Compliance (54 African countries)            │   │
│  │  └─ Fraud Detection & Signals                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              ▲                                   │
└──────────────┬───────────────┼───────────────┬──────────────────┘
               │               │               │
       ┌───────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐
       │  SHARED      │ │  PAYMENTS  │ │  GOVERNANCE │
       │  INFRA       │ │  LAYER     │ │  & COMPLIANCE
       │              │ │            │ │              │
       │ ┌──────────┐ │ │┌──────────┐│ │┌───────────┐ │
       │ │PostgreSQL│ │ ││Niloticus ││ ││Sika Admin │ │
       │ │  Redis   │ │ ││(Netting) ││ │└───────────┘ │
       │ │ S3 / CDN │ │ │└──────────┘│ │              │
       │ │EventBus  │ │ │┌──────────┐│ │┌───────────┐ │
       │ │Analytics │ │ ││Paystack  ││ ││Dispute    │ │
       │ └──────────┘ │ ││Flutterwave││ │Resolution │ │
       └──────────────┘ │└──────────┘│ │└───────────┘ │
                        └────────────┘ └──────────────┘
               │               │               │
      ┌────────▼──────┐ ┌──────▼──────┐ ┌────▼────────────┐
      │ PRODUCT       │ │ CREATOR     │ │ LOGISTICS &     │
      │ VERTICALS     │ │ ECONOMY     │ │ COMMERCE        │
      │               │ │             │ │                 │
      │ ┌──────────┐  │ │┌─────────┐ │ │ ┌─────────────┐ │
      │ │OrbitMart │  │ ││Sankofa  │ │ │ │OrbitVerse   │ │
      │ │(e-comm)  │  │ ││(UGC)    │ │ │ │(Marketplace)│ │
      │ └──────────┘  │ │└─────────┘ │ │ └─────────────┘ │
      │ ┌──────────┐  │ │             │ │ ┌─────────────┐ │
      │ │FootballA │  │ │┌─────────┐ │ │ │Kliqa (B2B)  │ │
      │ │(Sports)  │  │ ││Sika OS  │ │ │ │(Verified    │ │
      │ └──────────┘  │ ││(Messenger)││ │ │Reviews)     │ │
      │ ┌──────────┐  │ │└─────────┘ │ │ │             │ │
      │ │Kopotrust │  │ │             │ │ │             │ │
      │ │(Fintech) │  │ │             │ │ │             │ │
      │ └──────────┘  │ │             │ │ │             │ │
      │ ┌──────────┐  │ │             │ │ │             │ │
      │ │Nonsfoma  │  │ │             │ │ │             │ │
      │ │(Wellness)│  │ │             │ │ │             │ │
      │ └──────────┘  │ │             │ │ │             │ │
      └───────────────┘ └─────────────┘ └─────────────────┘
```

---

## Layer Definitions

### 1. Core Platform: AfriVerify

**Purpose:** Single source of truth for African identity and trust.

**Key Contracts:**
- VIT JWT (RS256-signed, zero PII): `{sub, verification_level, trust_score, trust_level, country_code, id_types_verified}`
- Trust Score API: post and retrieve trust signals cross-platform
- KYC lookup: sub-100ms identity check
- Webhooks: verification completion, trust updates, fraud signals

**Dependencies:** PostgreSQL, Redis, Smile Identity, Twilio/Termii, AWS S3

**Maturity:** Production (MVP shipped on afriverify.sankofaapp.com)

**Team:** Owned and maintained by AfriVerify team

---

### 2. Shared Infrastructure

**Purpose:** Single set of resources, shared configuration, audit trails, analytics.

#### 2a. Database & Cache
- **PostgreSQL cluster:** Single source of truth for all entities
  - One logical identity per user (cross-product unique ID)
  - Shared user, merchant, and admin tables (with tenant scoping)
  - Append-only audit log (verification_events, trust_events, transactions)
  
- **Redis:** Session store, rate limiting, queues (BullMQ)

#### 2b. Object Storage & CDN
- **S3 (af-south-1):** KMS-encrypted documents, ID scans, selfies, media
- **CDN:** Cached product images, creator content (Cloudinary)

#### 2c. Event Bus & Analytics
- **Event stream:** PostgreSQL LISTEN/NOTIFY or Kafka for async workflows
- **Analytics:** Segment or PostHog for behavior tracking
- **Logging:** Centralized (CloudWatch, Datadog, or ELK)

#### 2d. Configuration & Secrets
- **Unified env config:** Tenant-specific feature flags, rate limits, corridors
- **Secrets:** AWS Secrets Manager or Vault for API keys, signing keys

**Maturity:** Partial (PostgreSQL per service; needs consolidation)

**Next Step:** Consolidate to single PostgreSQL cluster with logical schemas per service

---

### 3. Payments & Settlement Layer

**Purpose:** Cross-border netting, settlement, and financial operations.

#### 3a. Niloticus (Multilateral Netting Engine)
- **Job:** Receives cross-border payment instructions, groups by corridor, nets daily
- **Input:** Payment instructions (NGN→GHS, NGN→KES, ZAR→NGN)
- **Output:** Netted positions → Paystack / Flutterwave settlement
- **Critical contract:** Every corridor has a netting cycle (180s–600s); net positions feed a settlement ledger
- **Webhook:** Cycle completion, business position updates

**Integration Points:**
- **From:** OrbitVerse (escrow), Kopotrust (credit), Kliqa (Cowries ledger)
- **To:** Paystack (NGN), Flutterwave (non-NGN)

#### 3b. Wallet & Ledger Service (To Build)
- **Unified ledger:** All balances (Cowries, native currency, escrow holds)
- **Atomic transactions:** Debit/credit with reversal support
- **Audit trail:** Every move logged and immutable
- **Webhook:** Balance changes, settlement completion

**Maturity:** Niloticus is production-ready; unified ledger is not yet built

---

### 4. Governance & Compliance Layer

**Purpose:** Admin operations, dispute resolution, regulatory oversight.

#### 4a. Sika Admin
- **KYC review queue:** Manually review edge-case identities
- **Dispute arbitration:** Moderators resolve buyer-seller disputes
- **Payout notifications:** Templates for settlement events
- **Status:** Scaffold (HTTP surface and email templates done; escrow and database schema incomplete)

#### 4b. Admin Portal (To Build)
- **Merchant onboarding:** Review and approve new sellers
- **System health:** Corridor stats, netting efficiency, settlement delays
- **Fraud dashboard:** Flagged identities, dispute rate, chargeback tracking
- **Revenue tracking:** Fees collected, commission ledger

#### 4c. Compliance & Audit
- **KYC/AML logs:** Every identity verification, every trust event, every transaction
- **Data retention:** GDPR/CCPA-compliant data minimization and deletion
- **Regulatory reporting:** Monthly summaries by corridor and geography

**Maturity:** Sika Admin scaffold; portal and audit framework not started

---

### 5. Product Verticals

#### 5a. Commerce: OrbitMart + OrbitTrade
- **What:** Verified product marketplace with escrow and reputation
- **Identity dep:** Every seller onboarded via AfriVerify; trust score on profile
- **Payment dep:** Escrow held in wallet, released via Niloticus settlement
- **Review dep:** Only verified-purchase reviews (via Kliqa)
- **Status:** Production (Next.js frontend, Node backend, PostgreSQL schema complete)

#### 5b. Creator Economy: Sankofa
- **What:** African-owned UGC platform (sovereign, African rules)
- **Identity dep:** Creators verified via AfriVerify; content flagged by trust level
- **Revenue dep:** Ad revenue, tips, subscriptions paid via Niloticus
- **Status:** Code repo exists; needs full product specification and backend buildout

#### 5c. Messaging: Sika OS
- **What:** Sovereign, identity-first messenger (Rust core, Flutter UI)
- **Identity dep:** Every peer verified via AfriVerify (E2EE identity confirmation)
- **Commerce link:** Integrated into Sika mesh for peer-to-peer trades
- **Status:** Rust bindings incomplete; Flutter UI scaffold; no backend yet

#### 5d. Sports: FootballAfrika
- **What:** Talent discovery and verification (athletes, scouts, clubs)
- **Identity dep:** Every player verified via AfriVerify; trust score = career history
- **Payment dep:** Scout fees, tryout fees via wallet
- **Status:** Repo exists; minimal code; needs full buildout

#### 5e. Fintech: Kopotrust
- **What:** Android fintech app (offline-first credit tracking, P2P mesh, Supabase sync)
- **Identity dep:** Users linked to AfriVerify; credit limit = trust score
- **Payment dep:** Payments netted via Niloticus
- **Status:** Kotlin Android app; core logic done; needs backend consolidation

#### 5f. Wellness: Nonsfoma
- **What:** African-first wellness (workouts, nutrition, AI coach matching)
- **Identity dep:** Trainers verified via AfriVerify; trust score on profile
- **Payment dep:** Trainer fees via wallet
- **Status:** API and web app exist; needs mobile client

#### 5g. B2B Reviews: Kliqa
- **What:** Verified review platform (KYC-verified reviews, micro-rewards, voice AI)
- **Identity dep:** Every shopper synced with AfriVerify; KYC status on review
- **Rewards dep:** Cowries ledger (pre-funded merchant wallet)
- **Status:** Production (API and UI complete on kliqa.africa)

---

## Critical Integrations

### Data Model: One Identity, Many Platforms

```
users
├─ id (global UUID)
├─ phone (E.164)
├─ vit_id (AfriVerify identity_id, immutable)
├─ vit_expires_at
├─ vit_level (basic|standard|enhanced)
├─ trust_score (0–1000, synced from AfriVerify)
├─ trust_level (low|medium|high|very_high)
├─ identity_verified_at
└─ platforms_verified_on (JSONB array: ["afriverify", "orbitmart", "sankofa", ...])

merchants (sellers on OrbitMart, Kliqa, Nonsfoma, etc.)
├─ id
├─ user_id (FK users.id)
├─ vit_level (copied at verification time for fast checks)
├─ kyb_status (individual|registered_business|partnership)
├─ kyb_vit_id (AfriVerify KYB token, if applicable)
└─ wallet_id (FK wallets.id)

wallets (unified ledger)
├─ id
├─ user_id (FK users.id)
├─ merchant_id (FK merchants.id, nullable)
├─ balance_native (BigInt, cents/minor units)
├─ balance_cowries (BigInt, if in use)
├─ balance_escrow_held (BigInt)
├─ last_settlement_id (FK settlement_ledger.id)
└─ updated_at

settlement_ledger (append-only, immutable)
├─ id
├─ wallet_id
├─ amount (BigInt, signed)
├─ reason (settlement|charge|refund|correction)
├─ reference_id (FK payment.id, dispute.id, etc.)
├─ created_at
└─ [can never be deleted]
```

### Webhook Contracts

Every service publishes events to a central event bus (PostgreSQL LISTEN or Kafka):

```
identity.verified
├─ identity_id (from AfriVerify)
├─ user_id
├─ level
├─ timestamp

trust.updated
├─ identity_id
├─ old_score
├─ new_score
├─ reason (transaction|flagged|review|etc.)

payment.instruction.submitted
├─ payment_id
├─ from_merchant_id
├─ to_merchant_id
├─ amount
├─ corridor (NGN_GHS, etc.)

settlement.completed
├─ settlement_id
├─ from_wallet_id
├─ to_wallet_id
├─ amount
├─ settlement_method (netting|paystack|flutterwave)

dispute.opened
├─ dispute_id
├─ order_id
├─ buyer_id
├─ seller_id

review.submitted
├─ review_id
├─ order_id
├─ rating
├─ is_verified_purchase
```

---

## Prioritization & Roadmap

### Phase 1: Consolidate Core (Weeks 1–4)

**Objective:** Single source of truth for all services.

- [ ] **Database consolidation:** Migrate all services to shared PostgreSQL cluster
  - Create logical schemas: `identity`, `commerce`, `payments`, `governance`, `content`
  - Migrate OrbitMart, Kliqa, Niloticus to new schemas
  
- [ ] **Unified user model:** Implement shared `users` table
  - Migrate all existing user records from each service
  - Add VIT sync from AfriVerify
  
- [ ] **Event bus:** Set up PostgreSQL LISTEN/NOTIFY or Kafka
  - Publish identity.verified, trust.updated from AfriVerify
  - Consumers: OrbitMart, Kliqa, Kopotrust

- [ ] **Configuration service:** Centralize secrets and feature flags
  - AWS Secrets Manager for API keys, signing keys
  - Feature flags per tenant (domain), per geography

### Phase 2: Build Shared Infrastructure (Weeks 5–8)

**Objective:** Payments and governance layers ready for production.

- [ ] **Unified wallet & ledger:**
  - Create `wallets` and `settlement_ledger` tables
  - Implement atomic ledger writes with idempotency
  - Connect OrbitMart escrow, Niloticus settlement to ledger
  
- [ ] **Sika Admin — complete:**
  - Finish database schema (KYC review, disputes, payouts)
  - Add admin portal (merchant onboarding, system health)
  - Integrate email delivery (Resend or SMTP)
  
- [ ] **Compliance & audit:**
  - Implement audit logging (every VIT lookup, every transaction)
  - Build retention policy (90 days raw, 7 years aggregated)
  - Add regulatory reporting endpoints

### Phase 3: Connect Product Verticals (Weeks 9–16)

**Objective:** Every vertical uses shared identity, payments, governance.

- [ ] **Sankofa buildout:**
  - Backend API (creator profiles, content upload, monetization)
  - Connect to AfriVerify (creator verification)
  - Connect to wallet (tips, subscriptions)
  
- [ ] **Sika OS backend:**
  - Mesh protocol server (peer discovery, E2EE)
  - Connect to OrbitVerse for P2P trades
  
- [ ] **FootballAfrika MVP:**
  - Athlete profiles, tryout requests, talent discovery
  - Identity verification + trust score on profile
  
- [ ] **Nonsfoma mobile app:**
  - React Native or Flutter (match Kopotrust mobile)
  - Trainer payment via wallet

### Phase 4: Growth & Optimization (Weeks 17+)

**Objective:** Scale, compliance, monetization.

- [ ] **Performance:**
  - Database indexing, query optimization
  - Redis caching for hot reads (VIT, trust score)
  - CDN for product images, creator media
  
- [ ] **Compliance:**
  - GDPR data deletion API
  - KYC/AML periodic re-verification
  - PEP screening updates
  
- [ ] **Monetization:**
  - Merchant tiers (free, pro, enterprise)
  - Commission structure per vertical
  - API rate limiting and pricing
  
- [ ] **Mobile:**
  - Native mobile apps for each vertical
  - Offline-first for areas with poor connectivity

---

## Success Criteria

### By End of Phase 1
- [ ] All services on one PostgreSQL cluster
- [ ] Unified identity model (users table)
- [ ] Event bus live (identity.verified events flowing)
- [ ] Zero breaking changes to live product domains

### By End of Phase 2
- [ ] Payments settled end-to-end (OrbitMart escrow → Niloticus → merchant bank account)
- [ ] Sika Admin live (KYC review, dispute resolution)
- [ ] Compliance audit trail in place
- [ ] All events logged immutably

### By End of Phase 3
- [ ] 5+ product verticals using shared identity
- [ ] Cross-platform trust score (single VIT, trusted everywhere)
- [ ] Unified creator monetization (Sankofa, Nonsfoma, etc.)
- [ ] P2P trades possible via Sika OS mesh

### By End of Phase 4
- [ ] 1M+ active users
- [ ] 15+ corridors in Niloticus
- [ ] Sub-second API responses (cached)
- [ ] GDPR-compliant, SOC 2-ready

---

## Architecture Principles

1. **Single identity, portable everywhere:** VIT is the passport.
2. **Append-only audit trails:** Immutable ledgers for compliance.
3. **Atomic ledger writes:** No orphaned transactions.
4. **Identity-first:** Every action is tied to a verified AfriVerify identity.
5. **Open standards:** VIT is a JWT; event bus uses standard formats (Kafka, CDC).
6. **Zero PII at rest:** Never store raw names, ID numbers, or face embeddings.
7. **Tenant scoping:** Every query includes the user's organization or geography.

---

## Next Steps

1. **Fork this doc into each repo** with service-specific sections.
2. **Create a `roadmap.md`** in each vertical with 13-week timeline.
3. **Database migration plan:** Start with data modeling for shared schema.
4. **CI/CD alignment:** Ensure all services deploy to same cloud account.

---

**Authored:** 2026-10-09  
**Version:** 1.0 (Strategic Vision)  
**Owner:** nons9 (Ecosystem Architect)
