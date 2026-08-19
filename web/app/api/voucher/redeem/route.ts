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

  try {
    const res = await fetch(`${kliqaUrl}/api/internal/vouchers/${encodeURIComponent(code)}/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ redeemedBy }),
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to reach Kliqa API' }, { status: 502 });
  }
}
