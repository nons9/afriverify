/**
 * Colour helpers for white-label surfaces.
 * Tenants can set any brand colour for the hosted verification page; a hard-coded white button label is
 * unreadable on a light colour. `readableOn` picks ink or white by real WCAG contrast instead.
 */
export const BRAND_GOLD = '#C9960E';
export const INK = '#0D0B08';

// The API fills in this indigo when a tenant has not configured a colour. It is "unset", not a choice,
// so it resolves to the AfriVerify brand colour.
const LEGACY_DEFAULTS = new Set(['#4f46e5', '#6366f1']);

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number {
  const pa = parseHex(a), pb = parseHex(b);
  if (!pa || !pb) return 1;
  const [hi, lo] = [luminance(pa), luminance(pb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Ink or white, whichever has more contrast on `bg`. */
export function readableOn(bg: string): string {
  return contrastRatio(bg, INK) >= contrastRatio(bg, '#FFFFFF') ? INK : '#FFFFFF';
}

/** A tenant-supplied colour, or AfriVerify gold when unset / invalid / the legacy API default. */
export function resolveBrandColor(c?: string | null): string {
  if (!c) return BRAND_GOLD;
  const v = c.trim().toLowerCase();
  if (LEGACY_DEFAULTS.has(v) || !parseHex(v)) return BRAND_GOLD;
  return c.trim();
}
