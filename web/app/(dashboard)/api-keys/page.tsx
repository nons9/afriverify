'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Plus, Copy, Trash2, CheckCircle, Key } from 'lucide-react';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth';

interface ApiKeyRecord {
  id: string;
  platform_name: string;
  api_key_prefix: string;
  environment: 'sandbox' | 'production';
  tier: string;
  monthly_limit: number;
  verifications_this_month: number;
  last_used: string | null;
  is_active: boolean;
  created_at: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy} className="text-slate-500 hover:text-white transition-colors" title="Copy">
      {copied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [form, setForm] = useState({ platform_name: '', environment: 'sandbox' });
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  const session = getSession();

  useEffect(() => {
    api
      .get<{ keys: ApiKeyRecord[] }>('/v1/developer/keys')
      .then((d) => setKeys(d.keys))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    setCreating(true);
    try {
      const result = await api.post<{ api_key: string; id: string }>('/v1/developer/keys', {
        platform_name: form.platform_name,
        platform_email: session?.developer.email ?? '',
        environment: form.environment,
      });
      setNewKeyValue(result.api_key);
      setShowCreate(false);
      setForm({ platform_name: '', environment: 'sandbox' });
      const updated = await api.get<{ keys: ApiKeyRecord[] }>('/v1/developer/keys');
      setKeys(updated.keys);
    } catch (err: unknown) {
      setFormError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this API key? All requests using it will immediately fail.')) return;
    setRevoking(id);
    try {
      await api.delete(`/v1/developer/keys/${id}`);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setRevoking(null);
    }
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">API Keys</h1>
          <p className="text-slate-400 text-sm mt-1">Manage your platform API keys</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New key
        </button>
      </div>

      {/* One-time key display */}
      {newKeyValue && (
        <div className="mb-6 bg-green-500/10 border border-green-500/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-sm font-semibold text-green-400">API key created — save it now</span>
          </div>
          <p className="text-xs text-slate-400 mb-3">This key will not be shown again.</p>
          <div className="flex items-center gap-3 bg-black/30 rounded-lg px-4 py-3">
            <code className="text-sm text-green-300 font-mono flex-1 break-all">{newKeyValue}</code>
            <CopyButton text={newKeyValue} />
          </div>
          <button
            onClick={() => setNewKeyValue(null)}
            className="mt-3 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            I&apos;ve copied it — dismiss
          </button>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-white mb-5">Create API key</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              {formError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-3 py-2 rounded-lg">
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Platform name</label>
                <input
                  required
                  value={form.platform_name}
                  onChange={(e) => setForm((p) => ({ ...p, platform_name: e.target.value }))}
                  placeholder="e.g. My Fintech App"
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Environment</label>
                <select
                  value={form.environment}
                  onChange={(e) => setForm((p) => ({ ...p, environment: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  <option value="sandbox">Sandbox</option>
                  <option value="production">Production</option>
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setFormError(''); }}
                  className="flex-1 border border-white/10 text-slate-300 py-2.5 rounded-lg text-sm hover:border-white/20 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  {creating ? 'Creating...' : 'Create key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Keys table */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center py-16">
            <Key className="w-8 h-8 mx-auto mb-3 text-slate-600" />
            <p className="text-sm text-slate-500">No API keys yet. Create your first key to start building.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-white/10">
                <tr>
                  {['Platform', 'Key prefix', 'Environment', 'Usage (month)', 'Created', ''].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-medium text-white text-sm">{k.platform_name}</div>
                      <div className={`text-xs mt-0.5 ${k.is_active ? 'text-green-400' : 'text-slate-500 line-through'}`}>
                        {k.is_active ? 'Active' : 'Revoked'}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <code className="text-xs text-slate-300 bg-white/5 px-2 py-1 rounded">
                        {k.api_key_prefix}...
                      </code>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          k.environment === 'production'
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}
                      >
                        {k.environment}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-400">
                      {k.verifications_this_month} / {k.monthly_limit}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">{fmtDate(k.created_at)}</td>
                    <td className="px-5 py-4">
                      {k.is_active && (
                        <button
                          onClick={() => handleRevoke(k.id)}
                          disabled={revoking === k.id}
                          className="text-slate-500 hover:text-red-400 disabled:opacity-40 transition-colors"
                          title="Revoke key"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
