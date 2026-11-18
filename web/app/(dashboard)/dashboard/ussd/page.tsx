'use client';

import { useEffect, useState } from 'react';
import { Smartphone, AlertCircle, ShieldAlert, Copy, Check, KeyRound } from 'lucide-react';
import { api } from '@/lib/api';

interface ApiKey {
  id: string;
  platform_name: string;
  api_key_prefix: string;
  environment: string;
  is_active: boolean;
  ussd_service_code: string | null;
  ussd_secret_set?: boolean;
}

interface SecretResponse { success?: boolean; callback_secret?: string; callback_url?: string }

function KeyUssdCard({ apiKey }: { apiKey: ApiKey }) {
  const [code, setCode] = useState(apiKey.ussd_service_code ?? '');
  const [hasCode, setHasCode] = useState(!!apiKey.ussd_service_code);
  const [secretSet, setSecretSet] = useState(!!apiKey.ussd_secret_set);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [url, setUrl] = useState('');            // shown ONCE, never stored in the browser
  const [copied, setCopied] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      const r = await api.patch<SecretResponse>(`/v1/developer/keys/${apiKey.id}/ussd-code`, {
        ussd_service_code: code.trim() || null
      });
      setHasCode(!!code.trim());
      if (r.callback_url) { setUrl(r.callback_url); setSecretSet(true); }
      if (!code.trim()) { setSecretSet(false); setUrl(''); }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError((err as Error).message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleRotate() {
    if (secretSet && !confirm('Create a new callback URL? The current one stops working immediately, so you must update it at your aggregator.')) return;
    setSaveError('');
    try {
      const r = await api.post<SecretResponse>(`/v1/developer/keys/${apiKey.id}/ussd-secret`, {});
      if (r.callback_url) { setUrl(r.callback_url); setSecretSet(true); }
    } catch (err) {
      setSaveError((err as Error).message ?? 'Failed to create the callback URL');
    }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the URL is selectable text too */ }
  }

  const envBadge =
    apiKey.environment === 'production' ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400';

  return (
    <div className="py-6">
      <div className="flex items-center gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-white">{apiKey.platform_name}</span>
            <span className={`text-sm px-2 py-0.5 rounded-full font-medium ${envBadge}`}>{apiKey.environment}</span>
          </div>
          <span className="text-sm text-slate-400 font-mono mt-0.5 block">{apiKey.api_key_prefix}••••</span>
        </div>
      </div>

      <label htmlFor={`code-${apiKey.id}`} className="block text-sm font-medium text-slate-300 mb-2">USSD short code</label>
      <div className="flex gap-2">
        <input
          id={`code-${apiKey.id}`}
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="*384*1234#"
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-base text-white placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500/50 transition-colors"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-ink text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>
      {saveError && (
        <p role="alert" className="text-sm text-red-400 mt-2 flex items-center gap-1">
          <AlertCircle className="w-4 h-4" /> {saveError}
        </p>
      )}
      <p className="text-sm text-slate-400 mt-2">
        The exact code your telco or aggregator (e.g. Africa&apos;s Talking) assigned you, once your USSD
        application is registered with them.
      </p>

      {hasCode && !secretSet && !url && (
        <div role="alert" className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-base text-amber-100">
          <p className="flex items-center gap-2 font-semibold"><ShieldAlert className="w-5 h-5 shrink-0" aria-hidden /> USSD is switched off for this key until you create a callback URL</p>
          <p className="mt-1">USSD callbacks now need a secret so that nobody else can mark a phone number as verified. Create your callback URL, then paste it into your aggregator.</p>
          <button onClick={handleRotate} className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-ink text-sm font-semibold rounded-lg">
            <KeyRound className="w-4 h-4" aria-hidden /> Create callback URL
          </button>
        </div>
      )}

      {url && (
        <div className="mt-4 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
          <p className="text-base font-semibold text-green-100">Your callback URL. Copy it now: it is shown once.</p>
          <p className="text-base text-slate-200 mt-1">Paste it as the callback URL of your USSD application at your aggregator. Treat it like a password.</p>
          <div className="mt-3 flex gap-2 items-start">
            <code className="flex-1 break-all rounded bg-black/40 px-3 py-2 text-sm text-green-100 select-all">{url}</code>
            <button onClick={copy} className="shrink-0 inline-flex items-center gap-2 px-3 py-2 border border-white/20 rounded-lg text-sm text-white hover:bg-white/10">
              {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {hasCode && secretSet && !url && (
        <p className="mt-4 text-base text-slate-300 flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-2 text-green-300"><Check className="w-4 h-4" aria-hidden /> Callback URL is set.</span>
          <button onClick={handleRotate} className="underline text-slate-200 hover:text-white">Create a new one</button>
          <span className="text-slate-400">(use this if it was ever shared or leaked)</span>
        </p>
      )}
    </div>
  );
}

export default function UssdPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ keys: ApiKey[] }>('/v1/developer/keys')
      .then((d) => setKeys(d.keys.filter((k) => k.is_active)))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">USSD verification</h1>
        <p className="text-slate-300 text-base mt-1">
          Verify feature-phone users with no app and no data connection, over a USSD short code.
        </p>
      </div>

      <div className="mb-8">
        <h3 className="text-base font-semibold text-white mb-3">How it works</h3>
        <ul className="space-y-2 text-base text-slate-300">
          <li className="flex items-start gap-2">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            Register a USSD application with a telco or aggregator (e.g. Africa&apos;s Talking).
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            Enter the short code they assign you below. We then give you a private callback URL (it contains a secret
            only you hold). Paste it as the application&apos;s callback URL.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            A user dialing in and confirming reaches Level 1 (phone-verified) immediately: the USSD session
            itself proves phone possession, so no OTP round-trip is needed. That proof is only trustworthy because the
            callback is secret, which is why requests without it are refused.
          </li>
        </ul>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32" role="status" aria-label="Loading">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-16">
          <Smartphone className="w-10 h-10 mx-auto mb-4 text-slate-600" />
          <h3 className="text-white font-medium mb-1">No active API keys</h3>
          <p className="text-slate-400 text-base">Create an API key first to configure USSD.</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {keys.map((k) => (
            <KeyUssdCard key={k.id} apiKey={k} />
          ))}
        </div>
      )}
    </div>
  );
}
