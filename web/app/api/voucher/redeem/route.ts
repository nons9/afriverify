import { NextRequest, NextResponse } from 'next/server';
import { voucherGate } from '@/lib/voucher-gate';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Must be a logged-in developer, within the rate limit. The account that gets the credit is the one the LOGIN
  // proves; any `redeemedBy` the browser sends is ignored.
  const gate = await voucherGate(req, 'redeem');
  if (!gate.ok) return gate.response;

  let code: string | undefined;
  try {
    ({ code } = (await req.json()) as { code?: string });
  } catch {
    return NextResponse.json({ error: 'A voucher code is required.' }, { status: 400 });
  }
  if (!code || typeof code !== 'string' || code.length > 64) {
    return NextResponse.json({ error: 'A voucher code is required.' }, { status: 400 });
  }

  const kliqaUrl = process.env.KLIQA_API_URL;
  const secret = process.env.KLIQA_INTERNAL_SECRET;
  if (!kliqaUrl || !secret) {
    return NextResponse.json({ error: 'Voucher service is not configured.' }, { status: 503 });
  }

  const url = `${kliqaUrl.replace(/\/$/, '')}/api/internal/vouchers/${encodeURIComponent(code)}/redeem`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ redeemedBy: gate.developerId }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (err) {
    // log the detail for us; never send internal URLs or error text to the browser
    console.error('[voucher/redeem] upstream failed', { msg: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Voucher service is unavailable right now. Please try again.' }, { status: 502 });
  }
}
