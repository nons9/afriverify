'use client';

import { useEffect, useState, useCallback, FormEvent } from 'react';
import { Ban, Plus, Trash2, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';

interface BlacklistEntry {
  id: string;
  identity_id: string | null;
  type: string;
  value: string;
  reason: string;
  scope: string;
  reported_by_platform: string | null;
  added_by: string;
  confirmed_at: string | null;
  created_at: string;
}

const BL_TYPES = ['face_hash', 'device_id', 'phone', 'ip_range', 'id_number_hash'];

export default function AdminBlacklistPage() {
  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [scopeFilter, setScopeFilter] = useState('');
  const [form, setForm] = useState({ type: 'phone', value: '', reason: '', scope: 'platform', identity_id: '' });

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: '50',
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(scopeFilter ? { scope: scopeFilter } : {}),
    });
    adminApi.get<{ entries: BlacklistEntry[] }>(`/v1/admin/blacklist?${params}`)
      .then((res) => setEntries(res.entries))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [typeFilter, scopeFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(''); setSaving(true);
    try {
      const body: Record<string, unknown> = { type: form.type, value: form.value, reason: form.reason, scope: form.scope };
      if (form.identity_id) body.identity_id = form.identity_id;
      await adminApi.post('/v1/admin/blacklist', body);
      setSuccess('Entry added to blacklist.');
      setShowForm(false);
      setForm({ type: 'phone', value: '', reason: '', scope: 'platform', identity_id: '' });
      load();
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this blacklist entry?')) return;
    try {
      await adminApi.delete(`/v1/admin/blacklist/${id}`);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setSuccess('Entry removed.');
    } catch (err: unknown) { setError((err as Error).message); }
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Ban className="w-5 h-5 text-rose-400" />
          <h1 className="text-2xl font-bold text-white">Blacklist</h1>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Add entry
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-4 py-3 rounded-lg mb-4">
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />{success}
        </div>
      )}

      {showForm && (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-white mb-4">Add blacklist entry</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Type *</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none"
                >
                  {BL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Scope *</label>
                <select
                  value={form.scope}
                  onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none"
                >
                  <option value="platform">Platform</option>
                  <option value="global">Global</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Value *</label>
              <input
                required value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                placeholder={form.type === 'phone' ? '+234…' : form.type === 'ip_range' ? '192.168.1.0/24' : 'Raw value (will be hashed if needed)'}
                className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Reason *</label>
              <input
                required value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Fraud, repeated failed attempts, reported by partner…"
                className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Identity ID (optional)</label>
              <input
                value={form.identity_id}
                onChange={(e) => setForm((f) => ({ ...f, identity_id: e.target.value }))}
                placeholder="UUID of verified_identity to flag"
                className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button type="submit" disabled={saving} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {saving ? 'Adding…' : 'Add entry'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="">All types</option>
          {BL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} className="bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="">All scopes</option>
          <option value="platform">Platform</option>
          <option value="global">Global</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-rose-400 animate-spin" /></div>
      ) : (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-white/5">
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Value</th>
                <th className="px-4 py-3 text-left font-medium">Reason</th>
                <th className="px-4 py-3 text-left font-medium">Scope</th>
                <th className="px-4 py-3 text-left font-medium">Added by</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">{entry.type}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300 max-w-xs truncate">{entry.value}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs max-w-xs truncate">{entry.reason}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${entry.scope === 'global' ? 'text-rose-400' : 'text-slate-400'}`}>{entry.scope}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{entry.added_by}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(entry.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleRemove(entry.id)} className="text-slate-500 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === 0 && <div className="py-12 text-center text-slate-500 text-sm">Blacklist is empty.</div>}
        </div>
      )}
    </div>
  );
}
