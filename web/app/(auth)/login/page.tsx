'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Shield } from 'lucide-react';
import { api } from '@/lib/api';
import { setSession, Developer } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // second step of two-step verification
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.post<{ token?: string; developer?: Developer; mfa_required?: boolean; mfa_token?: string }>('/v1/auth/login', {
        email,
        password,
      });
      if (data.mfa_required && data.mfa_token) {
        setChallenge(data.mfa_token);
        return;
      }
      setSession(data.token!, data.developer!);
      router.push('/dashboard');
    } catch (err: unknown) {
      setError((err as Error).message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleCode(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.post<{ token: string; developer: Developer; recovery_codes_remaining?: number }>('/v1/auth/login/mfa', {
        mfa_token: challenge,
        code: code.trim(),
      });
      setSession(data.token, data.developer);
      router.push(data.recovery_codes_remaining !== undefined ? '/dashboard/security' : '/dashboard');
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 401 && /expired/i.test((err as Error).message)) { setChallenge(''); setCode(''); }
      setError((err as Error).message || 'That code did not work');
    } finally {
      setLoading(false);
    }
  }

  if (challenge) {
    return (
      <div>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-500/10 mb-4">
            <Shield className="w-6 h-6 text-indigo-400" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold text-white">Two-step verification</h1>
          <p className="text-slate-300 text-base mt-2">
            {useRecovery ? 'Enter one of your recovery codes. Each works once.' : 'Enter the 6-digit code from your authenticator app.'}
          </p>
        </div>
        <form onSubmit={handleCode} className="space-y-4">
          {error && (
            <div role="alert" className="bg-red-500/10 border border-red-500/20 text-red-300 text-base px-4 py-3 rounded-lg">{error}</div>
          )}
          <div>
            <label htmlFor="mfa-code" className="block text-base font-medium text-slate-200 mb-1.5">{useRecovery ? 'Recovery code' : 'Authenticator code'}</label>
            <input
              id="mfa-code"
              required
              autoFocus
              autoComplete="one-time-code"
              inputMode={useRecovery ? 'text' : 'numeric'}
              maxLength={useRecovery ? 16 : 7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={useRecovery ? 'xxxxx-xxxxx' : '123456'}
              className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-lg px-4 py-3 text-lg tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-colors"
            />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-ink font-semibold py-3 rounded-lg text-base transition-colors">
            {loading ? 'Checking...' : 'Verify and sign in'}
          </button>
        </form>
        <div className="mt-6 flex flex-col items-center gap-2 text-base">
          <button type="button" onClick={() => { setUseRecovery(!useRecovery); setCode(''); setError(''); }} className="underline text-slate-200 hover:text-white">
            {useRecovery ? 'Use my authenticator app instead' : 'Use a recovery code instead'}
          </button>
          <button type="button" onClick={() => { setChallenge(''); setCode(''); setError(''); setUseRecovery(false); }} className="text-slate-400 hover:text-white">Back to password</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-500/10 mb-4">
          <Shield className="w-6 h-6 text-indigo-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">Welcome back</h1>
        <p className="text-slate-400 text-sm mt-1">Sign in to your developer console</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-ink font-semibold py-3 rounded-lg text-sm transition-colors"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        No account?{' '}
        <Link href="/register" className="text-indigo-400 hover:text-indigo-300 transition-colors">
          Create one free
        </Link>
      </p>
    </div>
  );
}
