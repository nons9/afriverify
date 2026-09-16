'use client';

import { useEffect, useState, useCallback } from 'react';
import { Key, Search, Loader2, AlertCircle } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';

interface AdminKey {
  id: string;
  platform_name: string;
  environment: string;
  scope: string;
  intent: string | null;
  is_active: boolean;
  verifications_this_month: number;
  total_verifications: number;
  created_at: string;
  developer_email: string;
  company_name: string;
}

export default function AdminApiKeysPage() {
  const [keys, setKeys] = useState<AdminKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [env, setEnv] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: '50',
      ...(search ? { developer_email: search } : {}),
      ...(env ? { environment: env } : {}),
    });
    adminApi.get<{ keys: AdminKey[] }>(`/v1/admin/api-keys?${params}`)
      .then((res) => setKeys(res.keys))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, env]);

  useEffect(() => { load(); }, [load]);

  async function toggleKey(id: string, current: boolean) {
    setError('');
    try {
      await adminApi.patch(`/v1/admin/api-keys/${id}`, { is_active: !current });
      setKeys((prev) => prev.map((k) => k.id === id ? { ...k, is_active: !current } : k));
    } catch (err: unknown) { setError((err as Error).message); }
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6 flex items-center gap-3">
        <Key className="w-5 h-5 text-rose-400" />
        <h1 className="text-2xl font-bold text-white">API Keys</h1>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by developer email…"
            className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-600 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50"
          />
        </div>
        <select value={env} onChange={(e) => setEnv(e.target.value)} className="bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="">All environments</option>
          <option value="live">Live</option>
          <option value="test">Test</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-rose-400 animate-spin" /></div>
      ) : (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-white/5">
                <th className="px-4 py-3 text-left font-medium">Key</th>
                <th className="px-4 py-3 text-left font-medium">Developer</th>
                <th className="px-4 py-3 text-left font-medium">Env</th>
                <th className="px-4 py-3 text-left font-medium">Scope</th>
                <th className="px-4 py-3 text-right font-medium">Verifs/mo</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-white font-medium text-sm">{k.platform_name}</div>
                    <div className="text-xs text-slate-600 font-mono">{k.id.slice(0, 8)}…</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-300 text-sm">{k.company_name}</div>
                    <div className="text-xs text-slate-500">{k.developer_email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${k.environment === 'live' ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' : 'text-slate-400 bg-white/5 border-white/10'}`}>
                      {k.environment}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 capitalize">{k.scope}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{k.verifications_this_month.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{k.total_verifications.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleKey(k.id, k.is_active)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                        k.is_active
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20'
                          : 'text-slate-500 bg-white/5 border-white/10 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/20'
                      }`}
                    >
                      {k.is_active ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {keys.length === 0 && <div className="py-12 text-center text-slate-500 text-sm">No keys found.</div>}
        </div>
      )}
    </div>
  );
}
