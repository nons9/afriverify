'use client';

import { useEffect, useState, FormEvent } from 'react';
import { UserCog, Plus, Loader2, AlertCircle, CheckCircle, Shield } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';
import { getAdminSession } from '@/lib/admin-auth';

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

const ROLES = ['super_admin', 'ops', 'support', 'finance'];

const roleColour = (role: string) => {
  if (role === 'super_admin') return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  if (role === 'ops') return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
  if (role === 'finance') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  return 'text-slate-400 bg-white/5 border-white/10';
};

export default function AdminUsersPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'support' });
  const currentAdmin = getAdminSession()?.admin;

  useEffect(() => {
    adminApi.get<{ admins: AdminUser[] }>('/v1/admin/users')
      .then((res) => setAdmins(res.admins))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(''); setSaving(true);
    try {
      const res = await adminApi.post<{ admin: AdminUser }>('/v1/admin/users', form);
      setAdmins((prev) => [...prev, res.admin]);
      setSuccess('Admin user created.');
      setShowForm(false);
      setForm({ email: '', password: '', full_name: '', role: 'support' });
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  async function toggleActive(id: string, current: boolean) {
    setError('');
    try {
      await adminApi.patch(`/v1/admin/users/${id}`, { is_active: !current });
      setAdmins((prev) => prev.map((a) => a.id === id ? { ...a, is_active: !current } : a));
    } catch (err: unknown) { setError((err as Error).message); }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-rose-400 animate-spin" /></div>;

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <UserCog className="w-5 h-5 text-rose-400" />
          <h1 className="text-2xl font-bold text-white">Admin Users</h1>
        </div>
        {currentAdmin?.role === 'super_admin' && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> New admin
          </button>
        )}
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
          <h2 className="text-sm font-semibold text-white mb-4">Create admin account</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Full name *</label>
                <input required value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Email *</label>
                <input required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Password * (min 10 chars)</label>
                <input required type="password" minLength={10} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Role *</label>
                <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none">
                  {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button type="submit" disabled={saving} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {saving ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-white/5">
              <th className="px-4 py-3 text-left font-medium">Admin</th>
              <th className="px-4 py-3 text-left font-medium">Role</th>
              <th className="px-4 py-3 text-left font-medium">Last login</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {admins.map((admin) => (
              <tr key={admin.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-rose-500/20 flex items-center justify-center text-xs font-bold text-rose-400">
                      {admin.full_name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div className="text-white font-medium">{admin.full_name}</div>
                      <div className="text-xs text-slate-500">{admin.email}</div>
                    </div>
                    {admin.id === currentAdmin?.id && (
                      <Shield className="w-3.5 h-3.5 text-rose-400 ml-1" />
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${roleColour(admin.role)}`}>
                    {admin.role.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {admin.last_login_at
                    ? new Date(admin.last_login_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                    : 'Never'}
                </td>
                <td className="px-4 py-3">
                  {admin.id !== currentAdmin?.id && currentAdmin?.role === 'super_admin' ? (
                    <button
                      onClick={() => toggleActive(admin.id, admin.is_active)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                        admin.is_active
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20'
                          : 'text-slate-500 bg-white/5 border-white/10 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/20'
                      }`}
                    >
                      {admin.is_active ? 'Active' : 'Disabled'}
                    </button>
                  ) : (
                    <span className={`text-xs ${admin.is_active ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {admin.is_active ? 'Active' : 'Disabled'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
