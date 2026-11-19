# Pricing and unit economics

Status: analysis and tooling only. No prices or metering were changed. The decisions in section 5 are yours.

## 1. What we charge today (from `billing.service.ts`)

| Plan | Price | Included | Per session |
| --- | --- | --- | --- |
| Free | $0 | 100 / month | $0 |
| Starter | $49 | 2,000 | $0.0245 |
| Growth | $149 | 10,000 | $0.0149 |
| Overage | | | $0.03 |

## 2. What the code does that matters for margin

These are facts read from the code, not assumptions.

1. **One session is one billable unit, whatever it grows into.** The counter and the usage record are written once, when a verification session is created (`routes/verify.ts`, `ussd.service.ts`, `inquiry-public.ts`), as `level1`. A session that goes on to an ID lookup (level 2) or a biometric check (level 3) is not counted again. Those are the steps that call paid vendors (Smile, Dojah, Onfido).
2. **Costs are incurred before the unit is earned.** The OTP SMS is sent after the session is counted, but resends send more messages and none of them is counted. Abandoned sessions still cost an SMS.
3. **Free tier costs real money.** 100 sessions per free key per month, each possibly sending an SMS. There is no cap on the number of free keys per person.
4. **Fixed costs are shared across all of this.** API, engine, Postgres, Redis, storage and web hosting are monthly bills whatever the volume.

## 3. The break-even test you can do without any vendor rate

A level 1 session costs at least the SMS (or email) it sends, times the average messages per session (1 + resends). So:

- On **Growth ($0.0149)**, level 1 loses money if one session costs more than 1.49 cents in SMS. At 1.3 messages per session that is an SMS rate above about 1.15 cents.
- On **Starter ($0.0245)**, the same limit is 2.45 cents per session, about 1.9 cents per message.
- On **overage ($0.03)**, 3 cents per session.

Look up your real per-message rate for Nigeria, Kenya, Ghana and South Africa on your Africa's Talking and Termii invoices and compare. If any main market is above those lines, level 1 alone is already unprofitable there, before a single ID lookup.

A level 2 or 3 session adds vendor lookups that typically cost several times the SMS. Unless your vendor contract is far cheaper than the published market, the current price cannot cover them.

## 4. The model

`npm run cost-model -- docs/cost-model.inputs.example.json` (run it from `api/`). It reads your rates, uses the live plan prices from the billing code, and prints cost per level, margin per plan at full use, overage margin, free-tier cost and the price needed for 50, 70 and 80% margin.

**The example file contains placeholder rates, not real ones.** Copy it, replace every number from your invoices, and mark the copy as real. The output with placeholders is only a demonstration of the method. With those placeholders every plan shows a loss, which is what the break-even test above predicts if real rates are near them.

Inputs worth being careful with: SMS rate by country and your country mix, resends per session, the share of sessions that reach level 2 and level 3, vendor price per lookup, and your actual monthly infrastructure bill (Railway, Vercel, storage, domains, monitoring).

## 5. Decisions taken (and how to switch them on)

Rule used: enterprise buyers accept usage that tracks cost, published rules and notice before change. Startups need low entry prices and no surprises. So prices of plans stay the same, the counting becomes fairer, and nothing changes any bill until you set a date.

| # | Decision | Status |
| --- | --- | --- |
| 1 | **Meter by level.** Phone check = 1 unit, plus ID check = 3 units in total, plus live face scan = 5 units in total. Each step is charged exactly once per session (retries and parallel requests cannot double-charge). | Built, OFF until `METERING_V2_AT` is set |
| 2 | **Cap OTP messages.** At most 3 codes per session on the API and hosted routes (the API route had no cap before). Fails closed if the counter store is down. | Live on deploy |
| 3 | **Price floor.** Plan prices unchanged ($49 and $149, overage 3 cents per unit). With units, a full verification (phone + ID + face) costs 5 units, about 12 cents on Starter and 7 cents on Growth, against a few cents when counted as one. The floor is enforced by the weights, not by a blind price rise. Re-run `npm run cost-model` with real rates after one month of metered data and raise unit prices only if margin is below your target. | Decided; no price change |
| 4 | **SMS pass-through.** Countries listed in `SMS_PREMIUM_PREFIXES` (JSON array of calling codes) add 1 unit to the phone check. Rule for listing a country: its SMS cost per session exceeds 40% of the unit price. The list is empty until you fill it from real invoices. | Built, empty |
| 5 | **Tighten the free tier.** New live free keys start at 50 a month (was 100), sandbox keeps 100, one email may hold 2 free live keys, and once metering is on, free live keys cannot run ID or face steps (those call paid vendors). Existing keys are not reduced. | Limits live on deploy; vendor gate OFF until metering date |
| 6 | **Grandfather.** A customer whose paid period began before `METERING_V2_AT` keeps the old counting until that period ends (one full billing cycle). Set the date at least 30 days after telling customers. | Built |

### To switch on

1. Fill `SMS_PREMIUM_PREFIXES` from your invoices (for example `["234"]`).
2. Email customers and add the date to the changelog (the pricing page shows the date automatically once it is set).
3. Set `METERING_V2_AT` (for example `2026-12-20T00:00:00Z`) on the API service. To roll back, remove it.

### Still needs your real numbers

Whether the plan prices themselves are right depends on your vendor and SMS rates, which I do not have. The model and the break-even rules in sections 3 and 4 will tell you in minutes once you fill the inputs.
