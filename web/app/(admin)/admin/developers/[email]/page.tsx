'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCircle, XCircle, Loader2, AlertCircle,
  Key, FileText, BarChart2
} from 'lucide-react';
import { adminApi } from '@/lib/admin-api';

interface DeveloperDetail {
  developer: {
    id: string; email: string; full_name: string; company_name: string;
    is_verified: boolean; phone: string; created_at: string;
    plan: string | null; sub_status: string | null;
    amount_cents: number; currency: string; billing_cycle: string;
    current_period_end: string | null;
  };
  api_keys: { id: string; platform_name: string; environment: string; scope: string; is_active: boolean; verifications_this_month: number; total_verifications: number; created_at: string }[];
  invoices: { invoice_number: string; status: string; total_amount_cents: number; currency: string; period_start: string; period_end: string; paid_at: string | null; created_at: string }[];
  verifications_by_month: { month: string; count: string }[];
}

const PLANS = ['free', 'starter', 'growth', 'enterprise', 'pay_per_use'];

export default function DeveloperDetailPage() {
  const { email } = useParams<{ email: string }>();
  const router = useRouter();
  const [data, setData] = useState<DeveloperDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    adminApi.get<DeveloperDetail>(`/v1/admin/developers/${decodeURIComponent(email)}`)
      .then(setData)
      .catch(() => setError('Developer not found'))
      .finally(() => setLoading(false));
  }, [email]);

  async function toggleVerified() {
    if (!data) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await adminApi.patch(`/v1/admin/developers/${decodeURIComponent(email)}`, {
        is_verified: !data.developer.is_verified,
      });
      setData((d) => d ? { ...d, developer: { ...d.developer, is_verified: !d.developer.is_verified } } : d);
      setSuccess('Developer status updated.');
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  async function changePlan(plan: string) {
    setSaving(true); setError(''); setSuccess('');
    try {
      await adminApi.patch(`/v1/admin/developers/${decodeURIComponent(email)}`, { plan });
      setData((d) => d ? { ...d, developer: { ...d.developer, plan } } : d);
      setSuccess('Plan updated.');
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-5 h-5 text-rose-400 animate-spin" /></div>;
  if (!data) return <div className="p-8 text-slate-400">{error || 'Not found'}</div>;

  const { developer: dev, api_keys, invoices, verifications_by_month } = data;

  return (
    <div className="p-8 max-w-5xl">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-slate-500 hover:text-white mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

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

      {/* Header */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {dev.is_verified
                ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                : <XCircle className="w-4 h-4 text-slate-500" />
              }
              <h1 className="text-xl font-bold text-white">{dev.company_name || dev.full_name}</h1>
            </div>
            <div className="text-sm text-slate-400">{dev.email}</div>
            {dev.phone && <div className="text-xs text-slate-500 mt-1">{dev.phone}</div>}
            <div className="text-xs text-slate-600 mt-1">
              Joined {new Date(dev.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={toggleVerified}
              disabled={saving}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                dev.is_verified
                  ? 'text-slate-400 border-white/10 hover:text-red-400 hover:border-red-500/30'
                  : 'text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/5'
              }`}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : dev.is_verified ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
              {dev.is_verified ? 'Unverify' : 'Mark verified'}
            </button>

            <select
              value={dev.plan ?? 'free'}
              onChange={(e) => changePlan(e.target.value)}
              disabled={saving}
              className="bg-white/5 border border-white/10 text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none"
            >
              {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5 mb-5">
        {/* API Keys */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Key className="w-4 h-4 text-rose-400" />
            <h2 className="text-sm font-semibold text-white">API Keys ({api_keys.length})</h2>
          </div>
          {api_keys.length === 0 ? (
            <p className="text-xs text-slate-500">No keys.</p>
          ) : (
            <div className="space-y-2">
              {api_keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between text-xs">
                  <div>
                    <span className="text-white font-medium">{k.platform_name}</span>
                    <span className="text-slate-500 ml-1.5">({k.environment})</span>
                  </div>
                  <div className="text-right text-slate-500">
                    {k.verifications_this_month.toLocaleString()} / mo
                    <span className={`ml-2 ${k.is_active ? 'text-emerald-400' : 'text-slate-600'}`}>
                      {k.is_active ? '●' : '○'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Monthly usage chart */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-rose-400" />
            <h2 className="text-sm font-semibold text-white">Verifications / month</h2>
          </div>
          {verifications_by_month.length === 0 ? (
            <p className="text-xs text-slate-500">No data.</p>
          ) : (
            <div className="space-y-1.5">
              {verifications_by_month.slice(0, 6).map((row) => {
                const max = Math.max(...verifications_by_month.map((r) => parseInt(r.count, 10)));
                const pct = max > 0 ? (parseInt(row.count, 10) / max) * 100 : 0;
                return (
                  <div key={row.month} className="flex items-center gap-3 text-xs">
                    <span className="text-slate-500 w-20 shrink-0">
                      {new Date(row.month).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
                    </span>
                    <div className="flex-1 bg-white/5 rounded-full h-1.5">
                      <div className="bg-rose-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-slate-400 w-12 text-right">{parseInt(row.count, 10).toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Invoices */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-rose-400" />
          <h2 className="text-sm font-semibold text-white">Invoices</h2>
        </div>
        {invoices.length === 0 ? (
          <p className="text-xs text-slate-500">No invoices.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-white/5">
                <th className="pb-2 text-left font-medium">Invoice #</th>
                <th className="pb-2 text-left font-medium">Period</th>
                <th className="pb-2 text-right font-medium">Amount</th>
                <th className="pb-2 text-left font-medium pl-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {invoices.map((inv) => (
                <tr key={inv.invoice_number} className="text-slate-300">
                  <td className="py-2 font-mono">{inv.invoice_number}</td>
                  <td className="py-2 text-slate-500">
                    {new Date(inv.period_start).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                  </td>
                  <td className="py-2 text-right">${(inv.total_amount_cents / 100).toFixed(2)}</td>
                  <td className="py-2 pl-4">
                    <span className={`capitalize ${inv.status === 'paid' ? 'text-emerald-400' : inv.status === 'open' ? 'text-amber-400' : 'text-slate-500'}`}>
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
