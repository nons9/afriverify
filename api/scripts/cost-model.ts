/* eslint-disable no-console */
import fs from 'fs';
import { CostInputs, validateInputs, unitCosts, planMargins, priceForMargin, overageMargin, freeTierCostPerMonth, smsCostPerMessage } from '../src/services/unit-economics';
import { PLAN_PRICING, OVERAGE_RATE_CENTS, SELF_SERVE_PLANS } from '../src/services/billing.service';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run cost-model -- path/to/inputs.json');
  process.exit(2);
}
const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as CostInputs & { _status?: string };
const errs = validateInputs(raw);
if (errs.length) {
  console.error('Invalid inputs:\n - ' + errs.join('\n - '));
  process.exit(2);
}

const usd = (n: number, d = 4) => `$${n.toFixed(d)}`;
const prices = {
  plans: SELF_SERVE_PLANS.map((id) => ({ id, price_usd: PLAN_PRICING[id].amountCents / 100, included: PLAN_PRICING[id].monthlyLimit })),
  overage_usd: OVERAGE_RATE_CENTS / 100,
};
if (raw._status) console.log(`!! ${raw._status}\n`);
const u = unitCosts(raw);
console.log('Cost of one session (USD)');
console.log(`  one OTP message (blended country mix): ${usd(smsCostPerMessage(raw))}  |  OTP cost per session: ${usd(u.otp)}`);
console.log(`  level 1: ${usd(u.level1)}   level 2: ${usd(u.level2)}   level 3: ${usd(u.level3)}`);
console.log(`  blended variable: ${usd(u.blended_variable)}  +  fixed share: ${usd(u.fixed_per_session)}  =  ${usd(u.blended_total)}\n`);
console.log('Plans at full use');
for (const m of planMargins(raw, prices)) {
  console.log(`  ${m.id.padEnd(8)} price ${usd(m.price_per_session)}/session  cost ${usd(m.cost_per_session)}/session  margin ${m.gross_margin_pct.toFixed(1)}%  profit $${m.profit_per_month_usd.toFixed(2)}/month`);
}
const o = overageMargin(raw, prices);
console.log(`  overage  price ${usd(o.price_usd)}  variable cost ${usd(o.cost_usd)}  margin ${o.margin_pct.toFixed(1)}%`);
console.log(`  free tier costs us about $${freeTierCostPerMonth(raw).toFixed(2)}/month\n`);
for (const t of [50, 70, 80]) console.log(`Price per session for ${t}% margin: ${usd(priceForMargin(raw, t))}`);
