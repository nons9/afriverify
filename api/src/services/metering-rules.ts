/**
 * Metering v2 rules (pure). A verification session is billed in units by how far it goes, because the
 * later steps are the ones that call paid vendors:
 *
 *   phone check (OTP)          1 unit   (charged when the session is created, as before)
 *   + ID document check        +2  => 3 units in total
 *   + live face scan and match +2  => 5 units in total
 *
 * Premium-SMS countries add 1 unit to the phone check, so an expensive SMS route cannot sink a plan.
 * Nothing here changes any bill until METERING_V2_AT is set to a date. Customers whose paid billing
 * period began before that date keep the old metering until that period ends (one full billing cycle).
 */
export type Step = 'phone' | 'id' | 'face';

export const UNIT_WEIGHTS: Record<Step, number> = { phone: 1, id: 3, face: 5 };
export const STEP_USAGE_TYPE: Record<Step, 'level1' | 'level2' | 'level3'> = { phone: 'level1', id: 'level2', face: 'level3' };

export function parseEffectiveAt(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type MeteringState = 'off' | 'grandfathered' | 'on';

/** Is the per-level metering in force for a customer right now? */
export function meteringState(now: Date, v2At: Date | null, subscription?: { periodStart: Date; periodEnd: Date } | null): MeteringState {
  if (!v2At || now < v2At) return 'off';
  if (subscription && subscription.periodStart < v2At && subscription.periodEnd > now) return 'grandfathered';
  return 'on';
}

export function parsePremiumPrefixes(raw: string | undefined | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map((x) => String(x).replace(/\D/g, '')).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function isPremiumPhone(phone: string, prefixes: string[]): boolean {
  const digits = phone.replace(/\D/g, '');
  return prefixes.some((p) => digits.startsWith(p));
}

/** Total units a session should have been billed once it reaches `step`. */
export function targetUnits(step: Step, premium: boolean): number {
  return UNIT_WEIGHTS[step] + (premium ? 1 : 0);
}

/** OTP messages one session may trigger. Each one can cost an SMS. */
export const OTP_MAX_SENDS = 3;
