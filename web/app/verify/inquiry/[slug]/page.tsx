'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, ScanFace, Shield } from 'lucide-react';
import { readableOn, resolveBrandColor } from '@/lib/color';
import { Copyright } from '@/components/copyright';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

interface Info {
  available: boolean;
  unavailable_reason: 'revoked' | 'expired' | 'full' | null;
  label: string;
  description: string | null;
  company_name: string;
  logo_url: string | null;
  primary_color: string;
  allowed_id_types: string[];
  liveness_required: boolean;
}

const REASON: Record<string, string> = {
  revoked: 'This verification link has been turned off by its owner.',
  expired: 'This verification link has expired.',
  full: 'This verification link has reached its limit.',
};

export default function InquiryPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/v1/public/inquiries/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        if (!r.ok) { setMissing(true); return; }
        setInfo(await r.json());
      })
      .catch(() => setMissing(true));
  }, [slug]);

  const primary = resolveBrandColor(info?.primary_color);
  const btnText = readableOn(primary);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`${API}/v1/public/inquiries/${encodeURIComponent(slug)}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.replace(/[\s()-]/g, '') }),
      });
      const body = await res.json().catch(() => ({})) as { session_token?: string; message?: string };
      if (!res.ok || !body.session_token) throw new Error(body.message ?? 'Could not start verification.');
      router.push(`/verify/${body.session_token}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/10 flex items-center gap-3">
          {info?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={info.logo_url} alt={info.company_name} className="h-8 w-auto" />
          ) : (
            <Shield className="w-6 h-6" style={{ color: primary }} aria-hidden />
          )}
          <span className="text-white font-semibold text-lg">{info?.company_name ?? 'Identity verification'}</span>
        </div>

        <div className="p-6">
          {!info && !missing && (
            <div className="flex justify-center py-10" role="status" aria-label="Loading">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          )}

          {missing && (
            <div className="text-center py-6">
              <h1 className="text-white font-semibold text-lg">Link not found</h1>
              <p className="text-slate-400 text-sm mt-2">Check the link you were given, or ask the sender for a new one.</p>
            </div>
          )}

          {info && !info.available && (
            <div className="text-center py-6">
              <h1 className="text-white font-semibold text-lg">Link unavailable</h1>
              <p className="text-slate-400 text-sm mt-2">{REASON[info.unavailable_reason ?? 'revoked']}</p>
            </div>
          )}

          {info && info.available && (
            <form onSubmit={start} className="space-y-4">
              <div>
                <h1 className="text-white font-semibold text-lg">{info.label}</h1>
                {info.description && <p className="text-slate-400 text-sm mt-1">{info.description}</p>}
              </div>
              <ul className="text-sm text-slate-400 space-y-1.5">
                <li>1. Confirm your phone number with a code</li>
                <li>2. Photograph your ID{info.allowed_id_types.length > 0 && ` (${info.allowed_id_types.map((t) => t.replace(/_/g, ' ')).join(', ')})`}</li>
                <li className="flex items-center gap-1.5">
                  3. {info.liveness_required && <ScanFace className="w-4 h-4" aria-hidden />}
                  {info.liveness_required ? 'Complete a quick live face scan' : 'Take a selfie'}
                </li>
              </ul>
              <div>
                <label htmlFor="phone" className="block text-sm text-slate-300 mb-1.5">Phone number</label>
                <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  placeholder="+233201234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
                <p className="text-xs text-slate-500 mt-1.5">Include your country code. We text you a one-time code.</p>
              </div>
              {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={busy || phone.length < 7}
                className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: primary, color: btnText }}
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                Continue
              </button>
            </form>
          )}
        </div>
      </div>
      <Copyright className="mt-6 text-xs text-slate-500 text-center" />
    </main>
  );
}
