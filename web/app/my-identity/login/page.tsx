'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { identityApi, setIdentitySession } from '@/lib/identity-auth';

export default function IdentityPortalLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await identityApi.post('/v1/identity-portal/login/otp/send', { phone });
      setStep('otp');
    } catch (err) {
      setError((err as Error).message || 'Could not send code');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmOtp(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token } = await identityApi.post<{ token: string }>('/v1/identity-portal/login/otp/confirm', {
        phone,
        otp
      });
      setIdentitySession(token);
      router.push('/my-identity');
    } catch (err) {
      setError((err as Error).message || 'Incorrect code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-500/10 mb-4">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Your identity</h1>
          <p className="text-slate-400 text-sm mt-1">
            See which platforms trust your AfriVerify verification, and disconnect any you no longer use.
          </p>
        </div>

        {step === 'phone' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone number</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+234..."
                className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-colors"
              />
              <p className="text-xs text-slate-500 mt-1.5">The phone number you verified with, including country code.</p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg text-sm transition-colors"
            >
              {loading ? 'Sending code...' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleConfirmOtp} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Enter the 6-digit code</label>
              <input
                type="text"
                inputMode="numeric"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-lg px-4 py-3 text-sm tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg text-sm transition-colors"
            >
              {loading ? 'Verifying...' : 'Continue'}
            </button>
            <button
              type="button"
              onClick={() => setStep('phone')}
              className="w-full text-slate-500 hover:text-slate-300 text-xs transition-colors"
            >
              Use a different number
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
