// Data Processing Agreement with Annex 1 (security measures) and Annex 2 (sub-processors).
export const DPA = `
This agreement forms part of the Master Services Agreement and applies whenever AfriVerify processes Personal Data for the Customer. If it conflicts with the Master Services Agreement on a data protection matter, this agreement prevails.

### 1. Roles

1.1 For Personal Data submitted through a Customer's keys, flows, hosted pages, inquiry links or USSD codes, the **Customer is the controller** and **AfriVerify is the processor**.

1.2 AfriVerify acts as an **independent controller** only for (a) fraud, abuse and security monitoring across the platform, (b) service-quality and capacity measurement that does not identify a person, (c) the identity portal, where a person manages their own verified identity directly with AfriVerify, and (d) meeting its own legal obligations. This split follows who decides why and how verification data is used: the Customer for its End Users, AfriVerify for its own security and the portal.

### 2. Details of processing

| Item | Detail |
| --- | --- |
| Subject matter | Verifying the identity of End Users on the Customer's behalf |
| Duration | The term of the agreement, then the periods in section 11 |
| Nature | Receiving, transmitting, analysing, comparing, storing, deleting |
| Purpose | The steps in Schedule 1 of the Terms that the Customer's flow requires, plus security and support |
| Data subjects | The Customer's End Users and, for the portal, individuals who verify |
| Personal Data | Phone number; email; name, date of birth and nationality as submitted; ID document type and number (stored as a hash); ID photo; selfie; live-scan frames and short capture video; face-match similarity score; IP address; device identifier; session and audit records; the Customer's own identifier for the End User; Outcomes, flags and reasons |
| Special categories | Biometric data (face images and live-scan video) processed to confirm identity; treated as sensitive Personal Data |
| Frequency | Continuous, on each Verification |

### 3. Instructions

3.1 AfriVerify will process Personal Data only on the Customer's documented instructions, which are this agreement, the Customer's use of the API and dashboard settings, and any written instruction that does not conflict with it. We will tell the Customer if we think an instruction breaks the law.

3.2 We will not sell Personal Data, use it for advertising, or use images or live-scan frames to train or improve models (Master Services Agreement, clause 6.3).

### 4. Personnel and confidentiality

Access is limited to staff who need it, who are bound by confidentiality and trained in data protection. Access to production data and keys is logged.

### 5. Security

AfriVerify maintains the measures in Annex 1, reviewed at least yearly, and will not materially reduce them.

### 6. Sub-processors

6.1 The Customer gives general authorisation to the sub-processors in Annex 2.

6.2 We will give at least 30 days' notice (by email and on the security page) before adding or replacing a sub-processor. The Customer may object in writing on reasonable data protection grounds within that time; if we cannot resolve it, the Customer may end the affected Services without penalty.

6.3 We bind each sub-processor to data protection duties no less protective than this agreement and remain responsible for them.

### 7. International transfers

7.1 The Services run on cloud infrastructure in the regions in Annex 2. Personal Data may therefore be processed outside the End User's country.

7.2 Where the Data Protection Laws require a safeguard for such a transfer we rely on a recognised mechanism, such as standard contractual clauses, an adequacy decision, binding corporate rules or the End User's explicit consent where permitted, and we will give the Customer a copy of the clauses on request. We record the mechanism used for each route in a register we give Customers on request.

### 8. Helping the Customer with rights and compliance

8.1 We will pass on any request from an End User about their Personal Data that concerns the Customer, without answering it ourselves unless the law or the Customer requires.

8.2 We provide tools (dashboard, API and the identity portal) to help the Customer access, correct, export or delete data. Where those cannot do it, we will help within 10 business days.

8.3 On request and at the Customer's cost where the work is substantial, we will help with data protection impact assessments and consultations with regulators.

### 9. Personal data breach

9.1 We will tell the Customer **without undue delay and in any case within 48 hours** of becoming aware of a breach affecting its Personal Data. The notice will describe the nature of the breach, the data and people affected where known, likely consequences, and the steps taken or proposed.

9.2 We will take reasonable steps to contain and fix it, keep the Customer informed, and give the information the Customer needs to meet its own notification duties. Where AfriVerify is itself a controller, it will notify the supervisory authority within 72 hours where required and affected individuals without undue delay.

### 10. Audit and evidence

10.1 We will give the Customer information needed to show we comply with this agreement, including answers to a reasonable security questionnaire.

10.2 AfriVerify does not currently hold SOC 2 or ISO 27001 certification, and no independent penetration test has been commissioned (see the security page). Until it does, the Customer may audit once a year on 30 days' notice, during business hours, under confidentiality, without access to other customers' data and at its own cost, either itself or through an independent auditor we accept. Where we obtain an independent report we will share it instead of an on-site audit where it answers the Customer's question.

### 11. Retention, return and deletion

11.1 **Automatic deletion.** The platform automatically deletes ID photos and selfies from sessions that were not completed after 30 days, and extra live-scan frames and capture video after 30 days by default. ID photos and selfies from completed verifications are deleted automatically 12 months after completion; the verification record and its hashed identifiers are kept for 7 years from last activity and the audit trail for 5 years, as stated in the Privacy Notice.

11.2 **On request or termination.** For 30 days after suspension or termination the Customer may export its data. After that we delete Customer Data from live systems within 30 days, unless the law requires us to keep it, and tell the Customer what we kept and why.

11.3 **Backups.** Encrypted backups of the database are taken every six hours and kept for 35 days. Deleted data therefore disappears from backups when those backups expire, no later than 35 days after deletion from live systems. We will not restore deleted data into live systems except to recover from a disaster, and will re-delete it if we do.

11.4 **Audit trail.** The append-only audit trail cannot be edited. Where deletion of a person's data is required, we remove or irreversibly anonymise the Personal Data in it rather than the record that an event happened.

### 12. Liability and order of precedence

Liability under this agreement is subject to clause 9 of the Master Services Agreement. Each party is responsible for its own compliance with the Data Protection Laws.

### Annex 1. Security measures

| Area | Measure in place today |
| --- | --- |
| Encryption in transit | TLS with HSTS on the API and website |
| Encryption of images | ID photos, selfies and live-scan frames are encrypted by the application with AES-256-GCM before storage |
| Access control | Customer data is scoped to the account; another account asking for it receives "not found"; API keys carry explicit permissions and can be revoked |
| Secrets | API keys are stored only as a hash; USSD callback secrets are stored as a hash and shown once; admin and session secrets are held outside the code |
| Abuse protection | Rate limits per key, address and phone number; one-time codes limited to 3 per session with 3 attempts, counted atomically; limits fail closed if their store is unavailable |
| Integrity | Idempotency keys stop duplicate verifications and charges; payments are confirmed with the provider before a plan activates; webhooks carry an HMAC signature |
| Audit | Append-only audit trail rejected for edit or delete at the database |
| Live-scan integrity | Server re-analyses every frame; random challenges; random screen-light sequence per attempt; camera integrity check; an unavailable engine never approves |
| Release safety | A failed database migration stops a deploy; readiness check (database, cache, migrations) gates traffic; containers run as unprivileged users |
| Resilience | Encrypted database backups every six hours, kept 35 days, with an automated restore test each week; alerts by email |
| Dependencies | Lockfiles committed; no known vulnerabilities in web, API or engine dependencies at the last review |
| Not yet in place | SOC 2, ISO 27001, independent penetration test, independent presentation-attack testing, bug bounty, customer-selectable data residency (see the security page) |

### Annex 2. Sub-processors

| Sub-processor | Purpose | Data | Location |
| --- | --- | --- | --- |
| Railway | Hosting for the API, liveness engine, database and cache | All Customer Data | API, database and cache: United States (west coast); liveness engine: Netherlands |
| Vercel | Website and dashboard hosting | Account and dashboard data; pages shown to End Users | Global edge network |
| S3-compatible object storage provider (named on the security page) | Encrypted image storage and encrypted backups | Encrypted images and backups | Region named on the security page and given on request |
| Africa's Talking | SMS one-time codes | Phone number, message text | Carriers in the destination country; provider based in Kenya |
| Termii | SMS one-time codes | Phone number, message text | Carriers in the destination country; provider based in Nigeria |
| Resend | Email one-time codes and service email | Email address, message text | Ireland |
| Flutterwave | Payments for paid plans | Customer billing contact and payment data (not End User data) | As stated in the provider's data terms |
| Smile Identity, Dojah, Onfido | Document and registry checks, and biometric checks on borderline cases, when a flow needs them | The minimum data for the check requested | As stated in each provider's data terms |
| AfriApp and Kliqa | Voucher validation | Voucher code only | As stated in the provider's terms |
| Error monitoring (only if switched on) | Error reports | Technical data with identifiers removed | As stated in the provider's terms |
`;
