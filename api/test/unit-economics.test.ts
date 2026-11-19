import test from 'node:test';
import assert from 'node:assert/strict';
import { CostInputs, unitCosts, planMargins, priceForMargin, overageMargin, validateInputs, smsCostPerMessage, freeTierCostPerMonth } from '../src/services/unit-economics';

const base: CostInputs = {
  sms_usd: { '234': 0.02, default: 0.04 },
  sms_country_mix: { '234': 0.5, default: 0.5 },
  sms_per_session: 1,
  email_share: 0,
  email_usd: 0,
  id_lookup_usd: 0.1,
  id_lookups_per_verification: 1,
  vendor_biometric_usd: 0.2,
  vendor_biometric_share: 0.5,
  infra_monthly_usd: 100,
  mix: { level1: 0.5, level2: 0.3, level3: 0.2 },
  payment_fee_pct: 0,
  payment_fee_fixed_usd: 0,
  monthly_sessions: 1000,
  free_tier_sessions: 0,
};
const near = (a: number, b: number, t = 1e-9) => assert.ok(Math.abs(a - b) <= t, `${a} vs ${b}`);

test('blended SMS cost follows the country mix and falls back to default', () => {
  near(smsCostPerMessage(base), 0.03);
});

test('level costs add up: l2 = otp + lookup, l3 adds the vendor biometric share', () => {
  const u = unitCosts(base);
  near(u.otp, 0.03);
  near(u.level1, 0.03);
  near(u.level2, 0.13);
  near(u.level3, 0.23);
  near(u.blended_variable, 0.5 * 0.03 + 0.3 * 0.13 + 0.2 * 0.23);
  near(u.fixed_per_session, 0.1);
});

test('resends and email share change the OTP cost', () => {
  const u = unitCosts({ ...base, sms_per_session: 2, email_share: 0.5, email_usd: 0.001 });
  near(u.otp, (0.5 * 0.03 + 0.5 * 0.001) * 2);
});

test('a plan priced below cost shows a negative margin; a plan priced above shows positive', () => {
  const cheap = planMargins(base, { plans: [{ id: 'x', price_usd: 24.5, included: 1000 }], overage_usd: 0.03 })[0];
  assert.ok(cheap.gross_margin_pct < 0);
  const rich = planMargins(base, { plans: [{ id: 'y', price_usd: 1000, included: 1000 }], overage_usd: 0.03 })[0];
  assert.ok(rich.gross_margin_pct > 0);
});

test('priceForMargin returns a price that earns that margin', () => {
  const p = priceForMargin(base, 60);
  const c = unitCosts(base).blended_total;
  near((p - c) / p, 0.6, 1e-9);
});

test('payment fee reduces margin and is part of the target price', () => {
  const withFee = { ...base, payment_fee_pct: 0.05 };
  const a = planMargins(base, { plans: [{ id: 'z', price_usd: 500, included: 1000 }], overage_usd: 0 })[0];
  const b = planMargins(withFee, { plans: [{ id: 'z', price_usd: 500, included: 1000 }], overage_usd: 0 })[0];
  assert.ok(b.gross_margin_pct < a.gross_margin_pct);
  assert.ok(priceForMargin(withFee, 50) > priceForMargin(base, 50));
});

test('overage and free tier use variable cost only', () => {
  const o = overageMargin(base, { plans: [], overage_usd: 0.03 });
  near(o.cost_usd, unitCosts(base).blended_variable);
  near(freeTierCostPerMonth({ ...base, free_tier_sessions: 100 }), 100 * unitCosts(base).blended_variable);
});

test('validateInputs rejects mixes that do not sum to 1 and negative numbers', () => {
  assert.equal(validateInputs(base).length, 0);
  assert.ok(validateInputs({ ...base, mix: { level1: 0.5, level2: 0.5, level3: 0.5 } }).length > 0);
  assert.ok(validateInputs({ ...base, sms_per_session: -1 }).length > 0);
  assert.ok(validateInputs({ ...base, monthly_sessions: 0 }).length > 0);
});
