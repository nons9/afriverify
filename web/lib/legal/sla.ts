// Service levels, support and status.
export const SLA = `
The commitments below apply to production keys on paid plans. They are written to match what AfriVerify can measure and show on its public status page. A target is a goal AfriVerify works to meet and measures in public; the credits in section 2 are the remedy if it is missed.

### 1. Availability

1.1 **Target.** AfriVerify targets 99.5% monthly availability of the production API. This is deliberately lower than the 99.9% many providers state, because AfriVerify runs one instance of each service today and prefers a commitment it can prove.

1.2 **How it is measured.** Availability is the share of the month the production API's readiness check (database, cache and migrations all healthy) answers successfully, as recorded by AfriVerify's own monitor and shown at afriverify.sankofaapp.com/status, which also displays its own coverage so gaps in measurement are visible.

1.3 **Exclusions.** Scheduled maintenance announced at least 24 hours ahead and not more than 4 hours a month; sandbox keys; failures caused by the Customer's systems or network; carriers and SMS delivery; identity providers and official registries; force majeure (Master Services Agreement, clause 13); and suspension under the Master Services Agreement or the Acceptable Use Policy.

### 2. Service credits

If monthly availability falls below the target, the Customer may claim a credit on the next invoice, as its sole remedy for the shortfall (other than the right to end the agreement for repeated failure).

| Monthly availability | Credit (share of that month's fees) |
| --- | --- |
| Below 99.5% and at least 99.0% | 5% |
| Below 99.0% and at least 95.0% | 15% |
| Below 95.0% | 30% |

The Customer must claim within 30 days of the month's end with the dates and times affected. Credits are not paid in cash. Persistent failure (below 99.0% in three months of any six) allows the Customer to end the agreement without penalty and receive a refund of prepaid fees for the unused period.

### 3. Recovery objectives

- **Recovery point objective**: up to 6 hours of recent data in a disaster, because encrypted database backups run every six hours.
- **Recovery time objective**: 4 hours to restore service from a backup in a disaster. This figure has **not yet been measured at production size**; AfriVerify will measure it in a restore drill and publish the result.
- Backups are kept for 35 days and restored in a test environment weekly (Data Processing Agreement, clause 11.3).

### 4. Support

| Channel | Use | Hours |
| --- | --- | --- |
| support@sankofaapp.com | Questions, incidents, billing | 08:00 to 18:00 West Africa Time, Monday to Friday |
| security@sankofaapp.com | Security reports and suspected breaches | Monitored continuously; acknowledgement target 3 business days (see the security page) |
| privacy@sankofaapp.com | Data protection requests | Reply within 30 days |
| Status page | Live availability and incidents | Always |

| Severity | Meaning | First response target | Update interval |
| --- | --- | --- | --- |
| 1 | Production API down or all verifications failing | 1 hour | Every 2 hours |
| 2 | A major feature degraded (for example SMS in one country, or the live scan) with a workaround | 4 hours | Every 8 hours |
| 3 | Minor defect or question | 2 business days | As agreed |

Response times are targets, not guarantees, and run during the hours above unless the order form buys extended support.

### 5. Incidents and communication

We will post a status update for any incident that affects production for more than 15 minutes, update it at the intervals above, and publish a short written account for Severity 1 incidents within 5 business days. Customers receive email notice of any incident that involves their Personal Data under the Data Processing Agreement, clause 9.

### 6. Maintenance and changes

Scheduled maintenance is announced at least 24 hours ahead on the status page and by email to account contacts. Emergency maintenance for security may happen at shorter notice. Releases are gated by a readiness check, and a failed database migration stops the release and leaves the previous version serving.

### 7. Customer responsibilities

The Customer will keep a technical contact current, monitor its own integration, handle retries with idempotency keys, honour rate limits, and report problems with the information needed to reproduce them.
`;
