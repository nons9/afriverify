import { NextRequest, NextResponse } from 'next/server';
import { voucherGate } from '@/lib/voucher-gate';

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Checking a code reveals whether it is valid and what it is worth, so it needs a login and a rate limit too.
  const gate = await voucherGate(req, 'check');
  if (!gate.ok) return gate.response;

  const code = req.nextUrl.searchParams.get('code');
  if (!code || code.length > 64) {
    return NextResponse.json({ error: 'A voucher code is required.' }, { status: 400 });
  }

  const kliqaUrl = process.env.KLIQA_API_URL;
  const secret = process.env.KLIQA_INTERNAL_SECRET;
  if (!kliqaUrl || !secret) {
    return NextResponse.json({ error: 'Voucher service is not configured.' }, { status: 503 });
  }

  const url = `${kliqaUrl.replace(/\/$/, '')}/api/internal/vouchers/${encodeURIComponent(code)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (err) {
    console.error('[voucher/check] upstream failed', { msg: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Voucher service is unavailable right now. Please try again.' }, { status: 502 });
  }
}
