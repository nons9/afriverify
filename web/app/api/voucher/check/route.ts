import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }

  const kliqaUrl = process.env.KLIQA_API_URL;
  const secret = process.env.KLIQA_INTERNAL_SECRET;
  if (!kliqaUrl || !secret) {
    return NextResponse.json({ error: 'Kliqa API not configured' }, { status: 503 });
  }

  try {
    const res = await fetch(`${kliqaUrl}/api/internal/vouchers/${encodeURIComponent(code)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to reach Kliqa API' }, { status: 502 });
  }
}
