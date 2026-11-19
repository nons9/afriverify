/**
 * Unit economics: what one verification costs us, and what margin each plan earns.
 *
 * Pure functions. Every rate is an INPUT; nothing here knows a vendor's real price. Copy
 * docs/cost-model.inputs.example.json, replace each rate with the number on your contract or invoice,
 * and run `npm run cost-model -- path/to/inputs.json`.
 */
export interface CostInputs {
  /** Cost of one SMS in USD, by country calling code ("default" is the fallback). */
  sms_usd: Record<string, number>;
  /** Share of sessions by calling code (sums to 1). */
  sms_country_mix: Record<string, number>;
  /** Average OTP messages per session (1 + resends). */
  sms_per_session: number;
  /** Share of sessions using email OTP instead of SMS (cost: email_usd). */
  email_share: number;
  email_usd: number;
  /** Vendor cost per document / registry lookup (Smile, Dojah, Onfido) and lookups per verified person. */
  id_lookup_usd: number;
  id_lookups_per_verification: number;
  /** Vendor cost per biometric call and the share of liveness runs that fall back to a vendor. */
  vendor_biometric_usd: number;
  vendor_biometric_share: number;
  /** Fixed monthly infrastructure bill (API, engine, Postgres, Redis, storage, web, monitoring) in USD. */
  infra_monthly_usd: number;
  /** Share of sessions that are level 1 / level 2 / level 3. Must sum to 1. */
  mix: { level1: number; level2: number; level3: number };
  /** Payment processor fee on subscription revenue, as a fraction, plus fixed USD per charge. */
  payment_fee_pct: number;
  payment_fee_fixed_usd: number;
  /** Expected monthly paid session volume (for spreading fixed cost). */
  monthly_sessions: number;
  /** Free-tier sessions per month we also pay for. */
  free_tier_sessions: number;
}

export interface PlanInput { id: string; price_usd: number; included: number }
export interface Prices { plans: PlanInput[]; overage_usd: number }

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function smsCostPerMessage(i: CostInputs): number {
  let total = 0;
  let share = 0;
  for (const [cc, s] of Object.entries(i.sms_country_mix)) {
    total += s * (i.sms_usd[cc] ?? i.sms_usd.default ?? 0);
    share += s;
  }
  return share > 0 ? total / share : (i.sms_usd.default ?? 0);
}

export interface UnitCosts {
  otp: number;
  level1: number;
  level2: number;
  level3: number;
  blended_variable: number;
  fixed_per_session: number;
  blended_total: number;
}

export function unitCosts(i: CostInputs): UnitCosts {
  const otp = ((1 - i.email_share) * smsCostPerMessage(i) + i.email_share * i.email_usd) * i.sms_per_session;
  const idl = i.id_lookup_usd * i.id_lookups_per_verification;
  const bio = i.vendor_biometric_usd * i.vendor_biometric_share;
  // Today one session is billed as one unit however far it goes, so a level 3 session carries all three costs.
  const level1 = otp;
  const level2 = otp + idl;
  const level3 = otp + idl + bio;
  const m = i.mix;
  const blended_variable = m.level1 * level1 + m.level2 * level2 + m.level3 * level3;
  const sessions = Math.max(1, i.monthly_sessions + i.free_tier_sessions);
  const fixed_per_session = i.infra_monthly_usd / sessions;
  return { otp, level1, level2, level3, blended_variable, fixed_per_session, blended_total: blended_variable + fixed_per_session };
}

export interface PlanMargin {
  id: string;
  price_usd: number;
  included: number;
  price_per_session: number;
  cost_per_session: number;
  gross_margin_pct: number;
  profit_per_month_usd: number;
}

/** Margin if a customer on this plan uses all of their included sessions. */
export function planMargins(i: CostInputs, p: Prices): PlanMargin[] {
  const u = unitCosts(i);
  return p.plans.map((pl) => {
    const fee = pl.price_usd * i.payment_fee_pct + i.payment_fee_fixed_usd;
    const cost = u.blended_total * pl.included + fee;
    const profit = pl.price_usd - cost;
    return {
      id: pl.id,
      price_usd: pl.price_usd,
      included: pl.included,
      price_per_session: pl.price_usd / pl.included,
      cost_per_session: cost / pl.included,
      gross_margin_pct: pl.price_usd > 0 ? (profit / pl.price_usd) * 100 : 0,
      profit_per_month_usd: profit,
    };
  });
}

/** Price per session needed to earn `targetMarginPct` after the payment fee. */
export function priceForMargin(i: CostInputs, targetMarginPct: number): number {
  const c = unitCosts(i).blended_total;
  return c / Math.max(0.01, 1 - targetMarginPct / 100 - i.payment_fee_pct);
}

export function overageMargin(i: CostInputs, p: Prices): { price_usd: number; cost_usd: number; margin_pct: number } {
  const c = unitCosts(i).blended_variable;
  return { price_usd: p.overage_usd, cost_usd: c, margin_pct: p.overage_usd > 0 ? ((p.overage_usd - c) / p.overage_usd) * 100 : 0 };
}

export function freeTierCostPerMonth(i: CostInputs): number {
  return i.free_tier_sessions * unitCosts(i).blended_variable;
}

export function validateInputs(i: CostInputs): string[] {
  const errs: string[] = [];
  const mixSum = sum(Object.values(i.mix));
  if (Math.abs(mixSum - 1) > 1e-6) errs.push(`mix must sum to 1 (got ${mixSum})`);
  const cs = sum(Object.values(i.sms_country_mix));
  if (Math.abs(cs - 1) > 1e-6) errs.push(`sms_country_mix must sum to 1 (got ${cs})`);
  for (const [k, v] of Object.entries(i)) {
    if (typeof v === 'number' && (v < 0 || Number.isNaN(v))) errs.push(`${k} must be a non-negative number`);
  }
  if (!(i.monthly_sessions > 0)) errs.push('monthly_sessions must be above 0');
  if (i.email_share < 0 || i.email_share > 1) errs.push('email_share must be between 0 and 1');
  return errs;
}
