'use client';

import { useEffect, useState } from 'react';
import { Smartphone, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface ApiKey {
  id: string;
  platform_name: string;
  api_key_prefix: string;
  environment: string;
  is_active: boolean;
  ussd_service_code: string | null;
}

function KeyUssdCard({ apiKey }: { apiKey: ApiKey }) {
  const [code, setCode] = useState(apiKey.ussd_service_code ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      await api.patch(`/v1/developer/keys/${apiKey.id}/ussd-code`, {
        ussd_service_code: code.trim() || null
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError((err as Error).message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const envBadge =
    apiKey.environment === 'production' ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400';

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{apiKey.platform_name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${envBadge}`}>{apiKey.environment}</span>
          </div>
          <span className="text-xs text-slate-500 font-mono mt-0.5 block">{apiKey.api_key_prefix}••••</span>
        </div>
      </div>

      <label className="block text-xs font-medium text-slate-400 mb-2">USSD short code</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="*384*1234#"
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 font-mono focus:outline-none focus:border-indigo-500/50 transition-colors"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>
      {saveError && (
        <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {saveError}
        </p>
      )}
      <p className="text-xs text-slate-500 mt-2">
        The exact code your telco or aggregator (e.g. Africa&apos;s Talking) assigned you, once your USSD
        application is registered with them.
      </p>
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
        <p className="text-slate-400 text-sm mt-1">
          Verify feature-phone users with no app and no data connection, over a USSD short code.
        </p>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 mb-8">
        <h3 className="text-sm font-semibold text-white mb-3">How it works</h3>
        <ul className="space-y-2 text-sm text-slate-400">
          <li className="flex items-start gap-2">
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            Register a USSD application with a telco or aggregator (e.g. Africa&apos;s Talking) and point its
            callback URL at{' '}
            <code className="text-indigo-300 text-xs">https://api.afriverify.sankofaapp.com/v1/ussd/callback</code>.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            Enter the short code they assign you below - it&apos;s how a callback resolves back to your account.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            A user dialing in and confirming reaches Level 1 (phone-verified) immediately - the USSD session
            itself proves phone possession, so no OTP round-trip is needed.
          </li>
        </ul>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-16 bg-white/[0.03] border border-white/10 rounded-xl">
          <Smartphone className="w-10 h-10 mx-auto mb-4 text-slate-700" />
          <h3 className="text-white font-medium mb-1">No active API keys</h3>
          <p className="text-slate-500 text-sm">Create an API key first to configure USSD.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {keys.map((k) => (
            <KeyUssdCard key={k.id} apiKey={k} />
          ))}
        </div>
      )}
    </div>
  );
}
