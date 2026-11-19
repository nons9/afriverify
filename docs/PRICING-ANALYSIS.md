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

## 5. Decisions for you (recommended direction)

I did not apply any of these because each changes what customers pay.

1. **Meter by level, not by session.** Count a unit per level reached (or charge a weight: level 1 = 1, level 2 = 3, level 3 = 5, set from the model). This fixes the biggest leak. Existing customers' bills rise only if they use levels 2 and 3, which is exactly where our cost is.
2. **Count every OTP message** (resends included) or cap resends per session, so SMS cost cannot be multiplied for free.
3. **Raise the floor.** Choose the per-session price from the model for a target margin (70% is a common SaaS aim for usage that carries pass-through cost), with a minimum monthly fee that covers fixed infrastructure.
4. **Pass SMS through at cost plus a margin for high-cost countries**, instead of one flat price for all of Africa.
5. **Tighten the free tier**: 100 sessions per verified business account (not per key), level 1 only, and no ID lookups.
6. **Grandfather existing paying customers** for one billing cycle and tell them before the change. Do not change meters or prices without notice.

Once you give me real rates, I can run the model, propose exact numbers, and implement the metering and price changes behind a switch so you can test them before they affect any bill.
