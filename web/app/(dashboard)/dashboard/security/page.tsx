'use client';

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AlertTriangle, CheckCircle2, Copy, Download, Lock, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';

interface Status { enabled: boolean; enabled_at: string | null; recovery_codes_remaining: number }
interface Setup { secret: string; otpauth_uri: string }

const input = 'w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50';
const primary = 'inline-flex items-center gap-2 px-4 py-3 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-ink text-base font-semibold rounded-lg';
const secondary = 'inline-flex items-center gap-2 px-4 py-3 border border-white/20 text-white hover:bg-white/5 text-base rounded-lg';

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the codes are selectable text too */ }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([`AfriVerify recovery codes\nEach works once. Keep them somewhere safe.\n\n${text}\n`], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'afriverify-recovery-codes.txt'; a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 space-y-4">
      <p className="flex items-center gap-2 text-lg font-semibold text-amber-100"><AlertTriangle className="w-5 h-5" aria-hidden /> Save your recovery codes now</p>
      <p className="text-base text-amber-50">If you lose your phone, these are the only way back into your account. Each code works once. We show them this one time and cannot show them again.</p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-lg text-white select-all" aria-label="Recovery codes">
        {codes.map((c) => <li key={c} className="rounded bg-black/40 px-3 py-2">{c}</li>)}
      </ul>
      <div className="flex flex-wrap gap-3">
        <button onClick={copy} className={secondary}><Copy className="w-4 h-4" aria-hidden /> {copied ? 'Copied' : 'Copy'}</button>
        <button onClick={download} className={secondary}><Download className="w-4 h-4" aria-hidden /> Download</button>
      </div>
      <label className="flex items-start gap-3 text-base text-white cursor-pointer">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-1 w-5 h-5" />
        I have saved these codes somewhere safe.
      </label>
      <button disabled={!saved} onClick={onDone} className={primary}>Done</button>
    </div>
  );
}

export default function SecurityPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [mode, setMode] = useState<'none' | 'disable' | 'regen'>('none');
  const [password, setPassword] = useState('');

  const load = useCallback(async () => {
    try { setStatus(await api.get<Status>('/v1/auth/mfa/status')); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function start() {
    setError(''); setBusy(true);
    try {
      const s = await api.post<Setup>('/v1/auth/mfa/setup', {});
      setSetup(s);
      setQr(await QRCode.toDataURL(s.otpauth_uri, { margin: 1, width: 220 }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function enable() {
    setError(''); setBusy(true);
    try {
      const r = await api.post<{ recovery_codes: string[] }>('/v1/auth/mfa/enable', { code: code.trim() });
      setCodes(r.recovery_codes); setSetup(null); setQr(''); setCode('');
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function disable() {
    setError(''); setBusy(true);
    try {
      await api.post('/v1/auth/mfa/disable', { password, code: code.trim() });
      setMode('none'); setPassword(''); setCode('');
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function regenerate() {
    setError(''); setBusy(true);
    try {
      const r = await api.post<{ recovery_codes: string[] }>('/v1/auth/mfa/recovery-codes', { code: code.trim() });
      setCodes(r.recovery_codes); setMode('none'); setCode('');
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Account security</h1>
        <p className="text-base text-slate-300 mt-1">Protect your account with a second step at sign-in. Even if someone learns your password, they cannot get in without your phone.</p>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-base text-red-200">{error}</p>}
      {!status && !error && <p className="text-base text-slate-400" role="status">Loading...</p>}

      {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}

      {status && !codes && (
        <section className="rounded-xl border border-white/10 bg-slate-900 p-6 space-y-5" aria-labelledby="mfa-heading">
          <div className="flex items-start gap-3">
            {status.enabled ? <ShieldCheck className="w-6 h-6 text-green-400 shrink-0 mt-0.5" aria-hidden /> : <Lock className="w-6 h-6 text-slate-300 shrink-0 mt-0.5" aria-hidden />}
            <div>
              <h2 id="mfa-heading" className="text-lg font-semibold text-white">Two-step verification</h2>
              <p className="text-base text-slate-300 mt-1">
                {status.enabled
                  ? <>On since {new Date(status.enabled_at!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. {status.recovery_codes_remaining} recovery code{status.recovery_codes_remaining === 1 ? '' : 's'} left.</>
                  : 'Off. Turn it on with an authenticator app such as Google Authenticator, Microsoft Authenticator, Authy or 1Password.'}
              </p>
              {status.enabled && status.recovery_codes_remaining <= 3 && (
                <p className="mt-2 flex items-center gap-2 text-base text-amber-200"><AlertTriangle className="w-4 h-4" aria-hidden /> You are running low on recovery codes. Replace them below.</p>
              )}
            </div>
          </div>

          {!status.enabled && !setup && <button onClick={start} disabled={busy} className={primary}>Turn on two-step verification</button>}

          {!status.enabled && setup && (
            <div className="space-y-5">
              <ol className="list-decimal pl-6 space-y-3 text-base text-slate-200">
                <li>Open your authenticator app and add a new account.</li>
                <li>
                  Scan this picture, or type the key by hand.
                  <div className="mt-3 flex flex-wrap items-center gap-5">
                    {qr && <img src={qr} alt="QR code for your authenticator app" width={220} height={220} className="rounded-lg bg-white p-2" />}
                    <div>
                      <p className="text-sm text-slate-400">Setup key</p>
                      <p className="font-mono text-lg text-white break-all select-all">{setup.secret.match(/.{1,4}/g)?.join(' ')}</p>
                    </div>
                  </div>
                </li>
                <li>
                  Type the 6-digit code your app shows, to prove it works.
                  <label htmlFor="enable-code" className="sr-only">6-digit code</label>
                  <input id="enable-code" className={`${input} mt-3 max-w-[14rem] tracking-widest font-mono text-lg`} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
                </li>
              </ol>
              <div className="flex gap-3">
                <button onClick={enable} disabled={busy || code.replace(/\s/g, '').length !== 6} className={primary}>Confirm and turn on</button>
                <button onClick={() => { setSetup(null); setQr(''); setCode(''); setError(''); }} className={secondary}>Cancel</button>
              </div>
            </div>
          )}

          {status.enabled && mode === 'none' && (
            <div className="flex flex-wrap gap-3">
              <button onClick={() => { setMode('regen'); setCode(''); setError(''); }} className={secondary}>Replace recovery codes</button>
              <button onClick={() => { setMode('disable'); setCode(''); setPassword(''); setError(''); }} className={secondary}>Turn off</button>
            </div>
          )}

          {status.enabled && mode === 'regen' && (
            <div className="space-y-4">
              <p className="text-base text-slate-200">Enter a code from your authenticator app. Your old recovery codes stop working.</p>
              <label htmlFor="regen-code" className="sr-only">6-digit code</label>
              <input id="regen-code" className={`${input} max-w-[14rem] tracking-widest font-mono text-lg`} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
              <div className="flex gap-3">
                <button onClick={regenerate} disabled={busy || code.replace(/\s/g, '').length !== 6} className={primary}>Replace codes</button>
                <button onClick={() => { setMode('none'); setError(''); }} className={secondary}>Cancel</button>
              </div>
            </div>
          )}

          {status.enabled && mode === 'disable' && (
            <div className="space-y-4">
              <p className="text-base text-slate-200">To turn it off, enter your password and a current code (or a recovery code). We will email you to confirm.</p>
              <div>
                <label htmlFor="off-password" className="block text-base text-slate-200 mb-1.5">Password</label>
                <input id="off-password" type="password" autoComplete="current-password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div>
                <label htmlFor="off-code" className="block text-base text-slate-200 mb-1.5">Authenticator or recovery code</label>
                <input id="off-code" className={`${input} max-w-[18rem] font-mono`} autoComplete="one-time-code" maxLength={16} value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <button onClick={disable} disabled={busy || !password || code.trim().length < 6} className="inline-flex items-center gap-2 px-4 py-3 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white text-base font-semibold rounded-lg">Turn off two-step verification</button>
                <button onClick={() => { setMode('none'); setError(''); }} className={secondary}>Cancel</button>
              </div>
            </div>
          )}
        </section>
      )}

      <p className="flex items-start gap-2 text-base text-slate-400">
        <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-slate-500" aria-hidden />
        Codes work once, wrong codes lock this step for 15 minutes after five tries, and we email you whenever two-step verification is changed.
      </p>
    </div>
  );
}
