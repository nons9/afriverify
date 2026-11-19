/**
 * Local-currency prices for the self-serve plans.
 *
 * Plans are priced in US dollars. To charge in a local currency we use a fixed rate table that the owner sets
 * (env LOCAL_CURRENCY_RATES). There are NO built-in rates: with the variable unset, only USD is offered.
 * Example:  {"NGN":{"per_usd":1600,"round_up_to":500},"GHS":{"per_usd":15,"round_up_to":5}}
 *   per_usd     local units per one US dollar
 *   round_up_to the local price is rounded UP to a multiple of this (default 1), so prices look clean
 * The price shown is the price charged: it is fixed when checkout starts, saved on our side, and the payment
 * is accepted only if the provider confirms at least that amount in that currency.
 */
export interface LocalRate { perUsd: number; roundUpTo: number }
export interface LocalQuote { currency: string; amountMinor: number }

export function parseRates(raw: string | undefined): Record<string, LocalRate> {
  if (!raw) return {};
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return {}; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out: Record<string, LocalRate> = {};
  for (const [code, v] of Object.entries(data as Record<string, unknown>)) {
    const cur = code.toUpperCase();
    const r = v as { per_usd?: unknown; round_up_to?: unknown };
    const perUsd = Number(r?.per_usd);
    const roundUpTo = r?.round_up_to === undefined ? 1 : Number(r.round_up_to);
    if (!/^[A-Z]{3}$/.test(cur) || cur === 'USD') continue;
    if (!Number.isFinite(perUsd) || perUsd <= 0 || !Number.isFinite(roundUpTo) || roundUpTo <= 0) continue;
    out[cur] = { perUsd, roundUpTo };
  }
  return out;
}

export const localRates = () => parseRates(process.env.LOCAL_CURRENCY_RATES);

/** The local price of a plan costing `usdCents`, in minor units (hundredths), or null when the currency is not offered. */
export function quoteLocal(usdCents: number, currency: string, rates: Record<string, LocalRate> = localRates()): LocalQuote | null {
  const cur = currency.toUpperCase();
  const rate = rates[cur];
  if (!rate) return null;
  const major = Math.ceil(((usdCents / 100) * rate.perUsd) / rate.roundUpTo) * rate.roundUpTo;
  return { currency: cur, amountMinor: Math.round(major * 100) };
}

export function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
  } catch {
    return `${currency.toUpperCase()} ${(minor / 100).toFixed(2)}`;
  }
}
