import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { code, redeemedBy } = (await req.json()) as { code?: string; redeemedBy?: string };
  if (!code || !redeemedBy) {
    return NextResponse.json({ error: 'code and redeemedBy are required' }, { status: 400 });
  }

  const kliqaUrl = process.env.KLIQA_API_URL;
  const secret = process.env.KLIQA_INTERNAL_SECRET;
  if (!kliqaUrl || !secret) {
    return NextResponse.json({ error: 'Kliqa API not configured' }, { status: 503 });
  }

  const url = `${kliqaUrl.replace(/\/$/, '')}/api/internal/vouchers/${encodeURIComponent(code)}/redeem`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ redeemedBy }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[voucher/redeem] fetch failed', { url, msg });
    return NextResponse.json({ error: `Failed to reach Kliqa API: ${msg}` }, { status: 502 });
  }
}
