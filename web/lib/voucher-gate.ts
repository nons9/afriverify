import { NextRequest, NextResponse } from 'next/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export type Gate = { ok: true; developerId: string } | { ok: false; response: NextResponse };

/**
 * Every voucher route proxies to an internal wallet service using a server-side secret, so it must only ever act
 * for a logged-in developer, within a rate limit, and for the account that the login proves: never an id the
 * browser sends. The AfriVerify API does all three in one call (it holds the session secret and the limiter).
 * Fails closed: if the API cannot be reached, nothing is forwarded.
 */
export async function voucherGate(req: NextRequest, action: 'check' | 'redeem'): Promise<Gate> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return { ok: false, response: NextResponse.json({ error: 'Please sign in again.' }, { status: 401 }) };
  }
  try {
    const res = await fetch(`${API}/v1/developer/voucher-gate`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (res.status === 401) return { ok: false, response: NextResponse.json({ error: 'Please sign in again.' }, { status: 401 }) };
    if (res.status === 429) {
      return { ok: false, response: NextResponse.json({ error: 'Too many attempts. Please wait a minute and try again.' }, { status: 429, headers: { 'Retry-After': res.headers.get('retry-after') ?? '60' } }) };
    }
    if (!res.ok) return { ok: false, response: NextResponse.json({ error: 'Voucher service is unavailable right now.' }, { status: 503 }) };
    const body = (await res.json()) as { developer_id?: string };
    if (!body.developer_id) return { ok: false, response: NextResponse.json({ error: 'Voucher service is unavailable right now.' }, { status: 503 }) };
    return { ok: true, developerId: body.developer_id };
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Voucher service is unavailable right now.' }, { status: 503 }) };
  }
}
