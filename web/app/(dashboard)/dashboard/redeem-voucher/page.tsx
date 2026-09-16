'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Ticket, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { getSession } from '@/lib/auth';

type Step = 'idle' | 'checking' | 'preview' | 'redeeming' | 'done' | 'error';

interface VoucherInfo {
  status: string;
  voucherValueUsd: number;
  expiresAt: string;
}

function tierMultiplier(tier: string): number {
  switch (tier) {
    case 'gold':     return 1.25;
    case 'platinum': return 1.5;
    default:         return 1.0;
  }
}

export default function RedeemVoucherPage() {
  const [code, setCode]         = useState('');
  const [step, setStep]         = useState<Step>('idle');
  const [voucher, setVoucher]   = useState<VoucherInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const session = getSession();

  async function handleCheck() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setStep('checking');
    setErrorMsg('');
    try {
      const res = await fetch(`/api/voucher/check?code=${encodeURIComponent(trimmed)}`);
      const data = await res.json() as VoucherInfo & { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Failed to validate voucher');
        setStep('error');
        return;
      }
      if (data.status !== 'active') {
        setErrorMsg(
          data.status === 'redeemed' ? 'This voucher has already been redeemed.'
          : data.status === 'expired' ? 'This voucher has expired.'
          : `Voucher is ${data.status}.`
        );
        setStep('error');
        return;
      }
      setVoucher(data);
      setStep('preview');
    } catch {
      setErrorMsg('Failed to reach Kliqa API. Please try again.');
      setStep('error');
    }
  }

  async function handleRedeem() {
    if (!voucher || !session) return;
    setStep('redeeming');
    try {
      const res = await fetch('/api/voucher/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase(), redeemedBy: session.developer.id }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Redemption failed');
        setStep('error');
        return;
      }
      setStep('done');
    } catch {
      setErrorMsg('Failed to reach Kliqa API. Please try again.');
      setStep('error');
    }
  }

  function reset() {
    setCode('');
    setStep('idle');
    setVoucher(null);
    setErrorMsg('');
  }

  const tier = session?.developer.full_name?.toLowerCase().includes('gold') ? 'gold'
             : session?.developer.full_name?.toLowerCase().includes('platinum') ? 'platinum'
             : 'silver';
  const mult = tierMultiplier(tier);
  const creditUsd = voucher ? +(voucher.voucherValueUsd * mult).toFixed(2) : 0;

  return (
    <div className="p-8 max-w-lg">
      <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link href="/dashboard" className="hover:text-slate-300 transition-colors">Dashboard</Link>
        <span>/</span>
        <span className="text-slate-300">Redeem Voucher</span>
      </nav>

      <h1 className="text-2xl font-bold text-white mb-1">Redeem a Kliqa Voucher</h1>
      <p className="text-sm text-slate-400 mb-8">Convert your Kliqa voucher code into Orbitverse wallet credit.</p>

      {/* Input card */}
      {(step === 'idle' || step === 'checking' || step === 'error') && (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 mb-4">
          <label className="block text-xs font-medium text-slate-400 mb-2">Voucher Code</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={e => { setCode(e.target.value.toUpperCase()); setStep('idle'); setErrorMsg(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleCheck(); }}
              placeholder="OV-XXXXXXX-XXXXXXX"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <button
              onClick={handleCheck}
              disabled={step === 'checking' || !code.trim()}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold text-white transition-colors flex items-center gap-2"
            >
              {step === 'checking' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Check
            </button>
          </div>
          {step === 'error' && (
            <div className="mt-3 flex items-start gap-2 text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {errorMsg}
            </div>
          )}
        </div>
      )}

      {/* Preview card */}
      {(step === 'preview' || step === 'redeeming') && voucher && (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 mb-4">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center">
              <Ticket className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-mono">{code.trim().toUpperCase()}</div>
              <div className="text-xs text-slate-500">
                Expires {new Date(voucher.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-white/5 rounded-lg p-3">
              <div className="text-xs text-slate-500 mb-1">Face Value</div>
              <div className="text-lg font-bold text-white">${voucher.voucherValueUsd.toFixed(2)}</div>
            </div>
            <div className="bg-indigo-500/10 rounded-lg p-3 border border-indigo-500/20">
              <div className="text-xs text-indigo-400 mb-1">You Receive ({mult}× bonus)</div>
              <div className="text-lg font-bold text-indigo-300">${creditUsd.toFixed(2)}</div>
            </div>
          </div>

          {mult > 1 && (
            <p className="text-xs text-slate-500 mb-5">
              Your {tier.charAt(0).toUpperCase() + tier.slice(1)} tier unlocks a {mult}× face-value bonus.
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleRedeem}
              disabled={step === 'redeeming'}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
            >
              {step === 'redeeming' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Redeem - credit ${creditUsd.toFixed(2)}
            </button>
            <button
              onClick={reset}
              disabled={step === 'redeeming'}
              className="px-4 py-2.5 border border-white/10 hover:border-white/20 rounded-lg text-sm text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Success card */}
      {step === 'done' && voucher && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-green-300">Voucher redeemed</div>
              <div className="text-xs text-slate-400">${creditUsd.toFixed(2)} added to your Orbitverse wallet</div>
            </div>
          </div>
          <button
            onClick={reset}
            className="w-full py-2.5 border border-white/10 hover:border-white/20 rounded-lg text-sm text-slate-400 hover:text-white transition-colors"
          >
            Redeem another voucher
          </button>
        </div>
      )}

      {/* How it works */}
      <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-5">
        <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-3">How it works</h3>
        <ul className="space-y-2 text-sm text-slate-400">
          <li className="flex items-start gap-2">
            <span className="text-indigo-500 font-bold shrink-0">1.</span>
            Get a voucher code from the Kliqa app (Withdraw → Orbitverse Voucher)
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-500 font-bold shrink-0">2.</span>
            Paste the code above and click Check
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-500 font-bold shrink-0">3.</span>
            Confirm the value and click Redeem - your wallet is credited instantly
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-500 font-bold shrink-0">4.</span>
            Kliqa Silver tier gives 1× face value; Gold and Platinum unlock up to 1.5× bonus
          </li>
        </ul>
      </div>
    </div>
  );
}
