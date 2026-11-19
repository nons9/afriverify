// Terms of Service: Master Services Agreement with Schedule 1 (the services) and Schedule 2 (fees and billing).
// Plain text with simple markdown. No backticks or dollar-brace sequences inside.
export const TERMS = `
This agreement is between Sankofa Network (business name registration BN 9753279, Akwa Ibom State, Nigeria) ("AfriVerify") and the person or entity that creates an account or signs an order form ("Customer"). It takes effect when the Customer creates an account, creates an API key, or signs an order, whichever is first.

Other documents that form part of it: the Acceptable Use Policy, the Data Processing Agreement, the Service Levels and Support terms, and the Biometric and Liveness Notice. The Privacy Notice explains how people who are verified are treated.

## Part A. Master Services Agreement

### 1. Definitions

- **Services**: the AfriVerify API, hosted verification pages, inquiry links, identity portal, dashboard, SDKs, documentation, Accuracy Studies tooling and any other feature described in Schedule 1.
- **Verification**: one attempt to confirm that an End User controls a phone number or email address, holds a genuine identity document, and is a live person matching that document, to the extent the Customer's flow requires.
- **Outcome**: the result AfriVerify returns for a Verification: pass, review or fail, with reasons and flags.
- **Customer Data**: all data the Customer or its End Users submit to the Services, including phone numbers, emails, document images, selfies and live-scan frames, and the Outcomes derived from them.
- **End User**: a person whose identity is checked through the Services at a Customer's direction.
- **Personal Data**, **controller**, **processor**: as defined by the Data Protection Laws.
- **Data Protection Laws**: all data protection and privacy laws that apply to the processing, including the Nigeria Data Protection Act 2023, the Kenya Data Protection Act 2019, the Ghana Data Protection Act 2012, South Africa's POPIA, and the GDPR where it applies.
- **Unit**: the measure used to count usage, defined in Schedule 2.

### 2. The Services

2.1 AfriVerify will provide the Services in accordance with this agreement, with reasonable skill and care, using suitably qualified staff.

2.2 We may improve, change or retire features. If we retire a paid feature in a way that materially reduces what the Customer pays for, we will give at least 90 days' notice, except where the change is needed for security or law.

2.3 Sandbox keys exist for testing. Sandbox results are not evidence of any real person's identity, carry no availability commitment, and may be reset.

### 3. Accounts and API keys

3.1 The Customer must give accurate account details and keep them current, and must be a legally incorporated entity or an individual acting in a lawful business.

3.2 API keys are secrets. We store only a hash of each key, so a lost key cannot be recovered, only replaced. The Customer is responsible for every action taken with its keys until it revokes them and must tell us at security@sankofaapp.com without delay if a key or account is compromised.

3.3 Each Customer may hold no more than two free live keys per email address. We may refuse, suspend or limit accounts that appear to circumvent this.

3.4 USSD callbacks use a per-key secret that we show once. The Customer must keep the callback address private and replace it if it is ever disclosed.

### 4. Customer responsibilities

4.1 **Lawful basis and consent.** The Customer is the controller of its End Users' Personal Data. It must have a lawful basis for each Verification, give End Users the Privacy Notice, and obtain valid consent where the law requires it, including explicit consent before any live face scan (the wording in the Biometric and Liveness Notice satisfies our requirements and may be shown as it stands).

4.2 **Use of Outcomes.** An Outcome is a risk signal, not a decision. A review Outcome means the system could not decide automatically and a person at the Customer should look. Where the law gives an individual the right not to be subject to a decision based solely on automated processing, the Customer must provide human review and a way to contest the result.

4.3 **Fair treatment.** The Customer must not use Outcomes in a way that unlawfully discriminates, and must give End Users who are rejected a route to retry or appeal. Accuracy can differ between groups of people, lighting and devices; our published study results state what we have measured.

4.4 **Acceptable use.** The Customer must follow the Acceptable Use Policy.

4.5 **Integration.** The Customer is responsible for how its application displays instructions, handles errors, and stores or acts on Outcomes, and for verifying webhook signatures.

### 5. Fees and payment

5.1 Fees are set out in Schedule 2 and on the public pricing page, which reads from the same system that bills the Customer.

5.2 Fees are exclusive of taxes. The Customer pays VAT, withholding tax and similar charges that apply to it and must give any certificate that lets us treat a payment as tax-exempt.

5.3 Subscriptions are paid in advance and are not renewed automatically. We do not store card details; payments are processed by our payment provider. A payment notification alone never activates a plan: we confirm the payment with the provider first.

### 6. Intellectual property

6.1 AfriVerify owns the Services, including software, models, detection methods, documentation and the AfriVerify name and logo. The Customer receives a non-exclusive, non-transferable right to use the Services during the term for its own business.

6.2 The Customer owns Customer Data. It grants AfriVerify a licence to process Customer Data only to provide the Services, to keep them secure, to prevent fraud and abuse, and to meet legal obligations.

6.3 AfriVerify will **not** use Customer Data, including images and live-scan frames, to train or improve models unless the Customer and the End User have given separate, specific, written consent. Aggregate, de-identified performance statistics that cannot identify a person or a Customer may be used to measure and report service quality.

6.4 Feedback may be used by AfriVerify without obligation.

### 7. Confidentiality

7.1 Each party must protect the other's non-public information with at least reasonable care, use it only for this agreement, and disclose it only to staff and advisers who need it and are bound to confidentiality.

7.2 This does not apply to information that is public without breach, was already known, was independently developed, or is lawfully received from a third party. A party may disclose information the law or a court requires, after telling the other where it lawfully can.

7.3 These duties continue for five years after the agreement ends, and for trade secrets and Personal Data for as long as they remain secret or the law requires.

### 8. Warranties and disclaimers

8.1 Each party warrants that it has the authority to enter into this agreement.

8.2 AfriVerify warrants that the Services will materially conform to Schedule 1 and that it will comply with the Data Protection Laws that apply to it as a processor.

8.3 **Accuracy is probabilistic.** Identity and liveness checks rely on statistical methods and third-party registries. They can wrongly accept (a false accept) or wrongly stop (a false reject) a real person. AfriVerify measures and publishes these rates with their limits and does not warrant that any Outcome is correct, that all fraud or spoofing attempts will be detected, or that the live scan meets any certification standard unless and until we say so in writing. The Customer remains responsible for its own risk decisions.

8.4 Third-party data and providers (including document registries, identity vendors and mobile networks) are outside AfriVerify's control. SMS delivery depends on carriers.

8.5 Except as stated, the Services are provided "as is", and all implied warranties, including merchantability and fitness for a purpose, are excluded to the extent the law permits.

### 9. Liability

9.1 Nothing limits liability that cannot lawfully be limited, including for fraud, death or personal injury caused by negligence.

9.2 Subject to 9.1, each party's total liability under this agreement is limited to the greater of (a) the fees paid and payable by the Customer in the three months before the event giving rise to the claim, and (b) USD 500. For breaches of the Data Processing Agreement or of confidentiality, the limit is the greater of USD 50,000 and the fees paid and payable in the twelve months before the event.

9.3 Neither party is liable for indirect, special or consequential loss, or for loss of profit, revenue or goodwill, however caused, except where 9.1 applies.

9.4 The Customer's duty to pay fees and its liability under 10.1 are not limited by 9.2(b).

### 10. Indemnities

10.1 The Customer will defend and indemnify AfriVerify against third-party claims, fines and reasonable costs arising from (a) the Customer's failure to obtain a required lawful basis, notice or consent from End Users, (b) the Customer's use of the Services in breach of the Acceptable Use Policy or the law, and (c) Customer Data that infringes a right.

10.2 AfriVerify will defend and indemnify the Customer against third-party claims that the Services, used as permitted, infringe that party's intellectual property rights, and may replace, modify or withdraw the affected feature and refund prepaid fees for it as the sole remedy beyond the defence.

10.3 The indemnified party must give prompt notice, reasonable help and sole control of the defence and settlement, and may not settle in a way that admits fault for the other party.

### 11. Term, suspension and termination

11.1 The agreement runs until terminated. Either party may end it for convenience on 30 days' written notice.

11.2 Either party may end it immediately on written notice if the other materially breaches it and does not fix the breach within 14 days of notice, or becomes insolvent.

11.3 AfriVerify may suspend access at once, to the extent needed, if the Customer's use creates a security risk, is unlawful or breaches the Acceptable Use Policy, or after unpaid fees and notice (see Schedule 2). We will restore access promptly when the cause is fixed.

11.4 On termination the Customer's right to use the Services ends, unpaid fees fall due, and the Data Processing Agreement governs return and deletion of Customer Data. Customer Data is preserved for 30 days after suspension or termination so the Customer can export it, and then deleted according to the Data Processing Agreement, except where the law requires us to keep it.

11.5 Clauses that by nature continue (including 6, 7, 8.3, 9, 10, 12 to 14) survive termination.

### 12. Sanctions, anti-corruption and compliance

Each party will comply with applicable sanctions and anti-bribery laws. The Customer states that neither it nor its owners are subject to sanctions that would make this agreement unlawful.

### 13. Force majeure

Neither party is liable for delay or failure caused by events beyond its reasonable control, such as natural disaster, war, strike, government action, power or telecoms failure, or the failure of a major cloud or carrier provider that could not reasonably have been avoided. The affected party must give notice and use reasonable efforts to resume. A payment obligation is not excused.

### 14. Governing law and disputes

14.1 This agreement is governed by the laws of the Federal Republic of Nigeria.

14.2 The parties will first try to settle a dispute by good-faith negotiation for 30 days. Failing that, the dispute is referred to binding arbitration under the Arbitration and Conciliation Act, with its seat in Lagos, in English, before one arbitrator.

14.3 Either party may ask any competent court for urgent interim relief to prevent irreparable harm, and for enforcement of an award.

### 15. General

- **Order of precedence**: an order form, then the Data Processing Agreement for Personal Data matters, then this Part A and its Schedules, then the other documents.
- **Entire agreement**: this agreement with any order form replaces earlier understandings on its subject.
- **Changes**: we may update these terms for legal or operational reasons by giving at least 30 days' notice by email to the account address. A change that is worse for the Customer in a material way allows the Customer to end the agreement without penalty before it takes effect.
- **Notices**: by email to the account address, or to legal@sankofaapp.com for AfriVerify. Security issues go to security@sankofaapp.com and privacy matters to privacy@sankofaapp.com.
- **Assignment**: neither party may assign without the other's consent, except to a successor to all or substantially all of its business on notice.
- **Subcontractors**: AfriVerify may use sub-processors and subcontractors (listed in the Data Processing Agreement) and remains responsible for them.
- **Severability, waiver, third parties**: an unenforceable clause is replaced by the nearest enforceable one; a delay in enforcing a right does not waive it; only the parties may enforce this agreement.
- **Publicity**: neither party may use the other's name or logo as a customer reference without written consent.

## Schedule 1. The services as built

This Schedule describes what AfriVerify provides. If the platform changes, the public documentation and changelog describe the change, and clause 2.2 of Part A applies.

### 1. How a Verification works

A Verification is a session with a time limit (15 minutes). It moves through steps; the Customer's flow decides which steps are required.

| Step | What happens | What is checked | Notes |
| --- | --- | --- | --- |
| Phone or email check (level 1) | A one-time code is sent by SMS or email, or the person confirms through USSD | The person controls the phone number or email | At most 3 codes per session and 3 wrong attempts per code. SMS is routed by country across more than one provider with automatic failover. |
| ID document check | The person submits an ID photo and details | The document and details are screened for tampering, screenshots and low quality, then checked against official registries through identity providers where the country is covered | Rejected images are not sent to identity providers. |
| Live face scan | The person follows random on-screen challenges (such as turning the head or blinking) while the camera records short frames | The server re-analyses every frame; it never trusts what the browser reports. It checks the challenges were done in order, signs of a photo or screen replay, a face that reflects a random sequence of screen colours, and the camera type | A scan that cannot be measured is never approved automatically. |
| Face match | The best live frame is compared with the ID photo | A similarity score. Only the score leaves the service; face templates are not kept or returned by AfriVerify's own engine | Borderline cases may be sent to an identity provider as a second opinion. |
| Screening | Optional anti-money-laundering and sanctions screening and re-screening | Matches against screening lists | Business-to-business checks (KYB) are available separately. |

### 2. Outcomes

- **Pass**: every required check completed and none raised a concern. The Customer may rely on it as one input to its own decision.
- **Review**: the system could not decide safely by itself (for example a possible screen replay, a suspected virtual camera, a missing screen-light measurement, or a borderline match). A person at the Customer should look, and the End User may be asked to try again.
- **Fail**: a required check failed or the session expired or was locked.

Each Outcome comes with reason codes and flags so the Customer can explain it. AfriVerify does not tell the Customer what a person's identity is; it reports what was checked and how it came out.

### 3. Channels and features

- **API and SDKs**: REST API with a published OpenAPI description, official JavaScript, Python, Go, PHP, Java and Ruby libraries, idempotency keys, rate-limit headers, and signed webhooks (HMAC) for results.
- **Hosted pages and white-label flows**: AfriVerify-hosted verification pages the Customer can brand.
- **Inquiry links**: a shareable link with a use limit, so a Customer can invite people to verify without building anything.
- **USSD**: verification on feature phones through a short code and a per-key secret callback.
- **Identity portal**: a person can log in with their phone number to see and manage their verified identity and which platforms are connected.
- **Flows**: configurable sets of steps per use case, including require live scan.
- **Verified Identity Token (VIT)**: a signed, portable attestation that a verification was completed, which the End User may choose to share.
- **Audit trail**: an append-only record of every step of a Verification that the database refuses to edit or delete.
- **Dashboard**: keys, usage and billing, flows, webhooks, verification history with reasons, team management, provider settings and rate limits.
- **Live Scan Lab and Accuracy Studies**: tools to try the live scan and to run consented studies that measure how often attacks are let through and how often real people are stopped, with confidence intervals and a skin-tone breakdown.
- **Public status, pricing and security pages**: self-measured availability, live prices and a plain list of what is and is not in place.

### 4. Data the services keep

| Data | Kept for | Notes |
| --- | --- | --- |
| ID photo and selfie from a session that never completed | 30 days, then deleted automatically | Set by AfriVerify |
| Extra live-scan frames and capture video | 30 days by default, then deleted | The single best frame follows the session policy |
| ID photo and selfie from a completed verification | 12 months after completion, then deleted automatically | For disputes and the Customer's records |
| Verification record and its hashed identifiers | 7 years from last activity | Needed for KYC evidence |
| Audit trail | 5 years | Append-only |
| Images in an Accuracy Study | The study's chosen period, default 180 days | A participant can withdraw at any time, which deletes their images and results |

All stored images are encrypted by the application with AES-256-GCM before they reach storage.

### 5. What the services do not do

- They do not certify that a document is genuine in law, or that a person is who they say they are beyond the checks listed.
- The live scan has **not** been certified by an independent laboratory (for example iBeta or a NIST-style evaluation). AfriVerify's own measured results are published with their limits.
- They do not make eligibility, credit, employment or other decisions about a person. The Customer does.

## Schedule 2. Fees, units and billing

Prices are in US dollars unless an order form says otherwise. The pricing page and the /v1/plans endpoint show the live figures and are read from the billing system itself; if they differ from this Schedule, the live figures for a plan already purchased do not change during its paid period.

### 1. Plans

| Plan | Price per month | Units included | Effective price per Unit |
| --- | --- | --- | --- |
| Free | $0 | 50 for new live keys; 100 for sandbox keys | n/a |
| Starter | $49 | 2,000 | $0.0245 |
| Growth | $149 | 10,000 | $0.0149 |
| Enterprise | Custom | Custom | By order form |

Units above the included amount ("overage") cost $0.03 each. Overage is calculated when the paid period ends and invoiced afterwards; the Customer keeps working in the meantime. Free keys created before 19 November 2026 keep the limit they were issued with.

### 2. How Units are counted

Usage is measured in Units by how far a Verification session goes, because later steps call paid providers and use more compute.

| Step reached | Units for that session (cumulative) |
| --- | --- |
| Phone or email check | 1 |
| Plus an ID document check | 3 |
| Plus a live face scan and match | 5 |
| Premium-SMS country surcharge (countries on AfriVerify's list of premium routes) | +1 on any session |

A step is counted **once per session**, even if the request is retried or sent twice at once. A step that was never reached is not counted. Sessions that never send a code are counted at creation as one Unit.

**Effective date and notice.** Counting by step starts on the effective date that AfriVerify announces on the pricing page and the changelog and by email to account holders at least 30 days earlier. Until that date every session counts as one Unit.

**Grandfathering.** A Customer whose paid period began before the effective date keeps the earlier counting until that period ends. The new counting applies from the start of its next period.

**Free live keys.** From the effective date a free live key may run phone or email checks only. ID and face steps need a paid plan on live keys. Sandbox keys may run every step with test providers and are not charged.

### 3. Payment and invoices

3.1 Subscriptions are paid in advance through our payment provider. A subscription does **not** renew automatically; the Customer pays again to continue.

3.2 We activate a plan only after the payment provider confirms the payment, for at least the full plan price in the plan's currency. A payment notification that is not confirmed does not activate anything. Each payment is processed once.

3.3 When a paid period ends without renewal, the subscription becomes past due. The Customer has a grace period of 3 days, during which access continues, and then the account returns to the free tier. Overage for the ended period is invoiced.

3.4 Invoices are issued in the account dashboard and by email, and are payable within 14 days unless the order form says otherwise. Overage invoices left unpaid may lead to suspension under clause 11.3 of Part A after notice.

3.5 The Customer must raise an invoice dispute in writing within 30 days of the invoice date and pay the undisputed part.

### 4. Taxes

Fees exclude taxes. Where the law requires us to charge VAT or similar taxes we will show them separately. The Customer pays withholding tax required by its country and must give evidence of payment to the authority.

### 5. Changes to prices

We may change prices for future periods on at least 30 days' written notice. A change does not affect a period already paid for. A Customer who does not accept a price increase may end the agreement before the new price applies.

### 6. Refunds and credits

Fees are non-refundable except (a) where the law requires, (b) where we charged in error, or (c) as stated in the Service Levels and Support terms for missed service levels. Prepaid voucher credit (for example AfriApp or Kliqa vouchers) is non-transferable, non-refundable and expires 12 months after redemption unless the voucher says otherwise.

### 7. Identity registry checks and prepaid credit

Checking an ID number against a government registry or an identity provider costs us a fee from that provider. We pass it on at our cost plus a small margin. The price for each country and ID type is on our pricing page, and we will tell you by email at least 30 days before a price goes up. You pay by topping up prepaid credit on an API key, from 5 to 500 US dollars at a time. The fee is taken from the credit when a check starts. If the check does not run, for example because the provider cannot be reached, the fee is returned to the credit straight away. A check that ran is not refunded, whether or not the person passed it. If the credit is too low for a check, the check is refused and nothing is taken. Credit does not expire while your account is open. When you close your account, we return unused credit on request within 30 days, less the fees the payment provider charged us to take it. Credit is not money held for you in a bank account, it is prepayment for these checks, and it cannot be transferred to another customer.

### 8. Currency and local payment methods

Prices are in US dollars. Where we offer a local currency at checkout, the price in that currency is worked out from a rate we set, is shown before you pay, and is fixed when you start checkout: the amount shown is the amount charged. Your bank or the payment provider may apply its own fees or exchange rate to your card or account, and we are not responsible for those charges.
`;
