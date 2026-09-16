'use client';

import { useEffect, useState } from 'react';
import { Layers, CheckCircle, ChevronDown, Info } from 'lucide-react';
import { api } from '@/lib/api';

type ProviderName = 'smile_identity' | 'dojah' | 'onfido';

interface RoutingRow {
  countries: string;
  id_types: string;
  primary: ProviderName;
  fallback: ProviderName;
}

interface ApiKeyRow {
  id: string;
  platform_name: string;
  preferred_provider: ProviderName | null;
}

interface SettingsResponse {
  routing_table: RoutingRow[];
  api_keys: ApiKeyRow[];
}

const PROVIDER_META: Record<ProviderName, { label: string; color: string; description: string }> = {
  smile_identity: {
    label: 'Smile Identity',
    color: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    description: 'Sub-Saharan Africa specialist. Strong in NG, GH, KE, ZA and 25+ other countries.'
  },
  dojah: {
    label: 'Dojah',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    description: 'Nigeria specialist. Lowest cost for BVN and NIN lookups, fastest response times.'
  },
  onfido: {
    label: 'Onfido',
    color: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    description: 'Global coverage. Best for North Africa (MA, EG, TN) and diaspora passports.'
  }
};

function ProviderBadge({ name }: { name: ProviderName }) {
  const meta = PROVIDER_META[name];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${meta.color}`}>
      {meta.label}
    </span>
  );
}

export default function ProviderSettingsPage() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<SettingsResponse>('/v1/developer/provider-settings')
      .then(setData)
      .catch(() => setError('Failed to load provider settings'));
  }, []);

  async function handleProviderChange(keyId: string, value: ProviderName | '') {
    setSaving(keyId);
    setError(null);
    try {
      await api.put('/v1/developer/provider-settings', {
        api_key_id: keyId,
        preferred_provider: value === '' ? null : value
      });
      setData((prev) => prev ? {
        ...prev,
        api_keys: prev.api_keys.map((k) =>
          k.id === keyId ? { ...k, preferred_provider: value === '' ? null : value } : k
        )
      } : prev);
      setSaved(keyId);
      setTimeout(() => setSaved(null), 2500);
    } catch {
      setError('Failed to save preference');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <h1 className="text-lg font-semibold text-white">Identity Providers</h1>
        </div>
        <p className="text-sm text-slate-400 ml-11">
          AfriVerify automatically routes each verification to the best provider for the country and
          ID type. You can also pin an API key to a specific provider.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Provider cards */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Available Providers
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(Object.entries(PROVIDER_META) as [ProviderName, typeof PROVIDER_META[ProviderName]][]).map(
            ([name, meta]) => (
              <div
                key={name}
                className="bg-slate-900 border border-white/10 rounded-xl p-4 space-y-2"
              >
                <ProviderBadge name={name} />
                <p className="text-xs text-slate-400 leading-relaxed">{meta.description}</p>
              </div>
            )
          )}
        </div>
      </section>

      {/* Routing table */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Auto-Routing Rules
          </h2>
          <div className="group relative">
            <Info className="w-3.5 h-3.5 text-slate-600 cursor-help" />
            <div className="hidden group-hover:block absolute left-0 bottom-full mb-1.5 w-64 bg-slate-800 border border-white/10 rounded-lg p-3 text-xs text-slate-300 shadow-xl z-10">
              Rules are evaluated top to bottom. First match wins. The fallback provider is used if
              the primary is unavailable.
            </div>
          </div>
        </div>
        {data ? (
          <div className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Countries</th>
                  <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">ID Types</th>
                  <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Primary</th>
                  <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Fallback</th>
                </tr>
              </thead>
              <tbody>
                {data.routing_table.map((row, i) => (
                  <tr key={i} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">
                      {row.countries}
                    </td>
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">
                      {row.id_types}
                    </td>
                    <td className="px-4 py-3">
                      <ProviderBadge name={row.primary} />
                    </td>
                    <td className="px-4 py-3">
                      <ProviderBadge name={row.fallback} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-slate-900 border border-white/10 rounded-xl p-6 flex justify-center">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </section>

      {/* Per-key overrides */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Provider Preference per API Key
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Leave as <span className="font-medium text-slate-400">Auto (recommended)</span> to use the
          routing table above. Pin to a specific provider to override routing for all verifications on
          that key — useful when you have a direct contract with a provider.
        </p>
        {data ? (
          <div className="space-y-2">
            {data.api_keys.length === 0 ? (
              <p className="text-sm text-slate-500 bg-slate-900 border border-white/10 rounded-xl p-6 text-center">
                No active API keys found.
              </p>
            ) : (
              data.api_keys.map((key) => (
                <div
                  key={key.id}
                  className="bg-slate-900 border border-white/10 rounded-xl px-4 py-3 flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{key.platform_name}</div>
                    <div className="text-xs text-slate-500 font-mono truncate">{key.id.slice(0, 8)}…</div>
                  </div>

                  <div className="relative shrink-0">
                    <select
                      value={key.preferred_provider ?? ''}
                      onChange={(e) => handleProviderChange(key.id, e.target.value as ProviderName | '')}
                      disabled={saving === key.id}
                      className="appearance-none bg-slate-800 border border-white/10 text-sm text-slate-200 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50 min-w-[180px]"
                    >
                      <option value="">Auto (recommended)</option>
                      <option value="smile_identity">Smile Identity</option>
                      <option value="dojah">Dojah</option>
                      <option value="onfido">Onfido</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>

                  <div className="w-5 h-5 shrink-0">
                    {saving === key.id && (
                      <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    )}
                    {saved === key.id && (
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="bg-slate-900 border border-white/10 rounded-xl p-6 flex justify-center">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </section>

      {/* Cost insight */}
      <section className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-5">
        <h3 className="text-sm font-medium text-indigo-300 mb-2">Cost savings with auto-routing</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Dojah's BVN and NIN lookups cost up to <span className="text-white font-medium">40% less</span> than
          the equivalent Smile Identity call. For a Nigerian-focused product doing 10,000
          verifications/month, auto-routing saves roughly <span className="text-white font-medium">$200–$400/month</span> at
          no extra configuration. Onfido's document checks are preferred for North African passports
          because they have direct registry access in Morocco, Egypt and Tunisia that other providers
          lack.
        </p>
      </section>
    </div>
  );
}
