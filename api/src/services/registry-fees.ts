/**
 * What a registry check costs the customer. The owner sets it (env REGISTRY_CHECK_FEES), at the vendor's price
 * plus a margin. There are NO built-in prices: a country and ID type with no price is simply not checked, so we
 * never pay a vendor for a check nobody is paying for.
 *   {"NG:NIN": 25, "NG:BVN": 20, "GH": 40, "*": 60}        values are US cents per check (decimals allowed)
 * Lookup order: "COUNTRY:ID_TYPE", then "COUNTRY", then "*". A price of 0 means a free check.
 */
export type FeeTable = Record<string, number>;

export function parseFees(raw: string | undefined): FeeTable {
  if (!raw) return {};
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return {}; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out: FeeTable = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    const key = k.toUpperCase().trim();
    const n = Number(v);
    if (!/^(\*|[A-Z]{2}(:[A-Z0-9_]+)?)$/.test(key)) continue;
    if (typeof v === 'boolean' || v === null || v === '' || !Number.isFinite(n) || n < 0 || n > 100_000) continue;
    out[key] = n;
  }
  return out;
}

export const feeTable = () => parseFees(process.env.REGISTRY_CHECK_FEES);

/** The fee in US cents for one check, or null when this country and ID type have no price. */
export function feeFor(country: string, idType: string, table: FeeTable = feeTable()): number | null {
  const c = country.toUpperCase();
  const t = idType.toUpperCase();
  for (const key of [`${c}:${t}`, c, '*']) if (key in table) return table[key];
  return null;
}

export function publicFeeList(table: FeeTable = feeTable()): { scope: string; cents: number }[] {
  return Object.entries(table).map(([scope, cents]) => ({ scope, cents })).sort((a, b) => a.scope.localeCompare(b.scope));
}

export const MIN_TOPUP_USD = 5;
export const MAX_TOPUP_USD = 500;
