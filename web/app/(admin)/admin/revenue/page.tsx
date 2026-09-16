'use client';

import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, FileText, Loader2 } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';

interface Revenue {
  mrr_cents: number;
  arr_cents: number;
  plan_breakdown: { plan: string; status: string; count: string; total_cents: string }[];
  current_month: { paid_cents: string; open_cents: string; paid_count: string; open_count: string };
  recent_invoices: { invoice_number: string; status: string; total_amount_cents: number; currency: string; period_start: string; period_end: string; paid_at: string | null; created_at: string }[];
}

interface History {
  history: { month: string; revenue_cents: string; invoice_count: string }[];
}

function fmt(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminRevenuePage() {
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminApi.get<Revenue>('/v1/admin/revenue'),
      adminApi.get<History>('/v1/admin/revenue/mrr-history'),
    ])
      .then(([r, h]) => { setRevenue(r); setHistory(h); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-rose-400 animate-spin" /></div>;
  if (!revenue) return null;

  const maxRevenue = history ? Math.max(...history.history.map((r) => parseInt(r.revenue_cents, 10)), 1) : 1;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-8">
        <DollarSign className="w-5 h-5 text-rose-400" />
        <h1 className="text-2xl font-bold text-white">Revenue</h1>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'MRR', value: fmt(revenue.mrr_cents), sub: 'monthly recurring' },
          { label: 'ARR', value: fmt(revenue.arr_cents), sub: 'annualised' },
          { label: 'This month (paid)', value: fmt(parseInt(revenue.current_month?.paid_cents ?? '0', 10)), sub: `${revenue.current_month?.paid_count ?? 0} invoices` },
          { label: 'Outstanding', value: fmt(parseInt(revenue.current_month?.open_cents ?? '0', 10)), sub: `${revenue.current_month?.open_count ?? 0} open` },
        ].map((m) => (
          <div key={m.label} className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-3">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-white">{m.value}</div>
            <div className="text-sm text-slate-400 mt-0.5">{m.label}</div>
            <div className="text-xs text-slate-600 mt-1">{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5 mb-5">
        {/* MRR history chart */}
        {history && history.history.length > 0 && (
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-white mb-4">Revenue (last 12 months)</h2>
            <div className="space-y-2">
              {history.history.map((row) => {
                const cents = parseInt(row.revenue_cents, 10);
                const pct = (cents / maxRevenue) * 100;
                return (
                  <div key={row.month} className="flex items-center gap-3 text-xs">
                    <span className="text-slate-500 w-20 shrink-0">
                      {new Date(row.month).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
                    </span>
                    <div className="flex-1 bg-white/5 rounded-full h-2">
                      <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-slate-400 w-20 text-right">{fmt(cents)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Plan breakdown */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Subscriptions by plan</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-white/5">
                <th className="pb-2 text-left font-medium">Plan</th>
                <th className="pb-2 text-right font-medium">Count</th>
                <th className="pb-2 text-right font-medium">MRR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {revenue.plan_breakdown.map((row, i) => (
                <tr key={i} className="text-slate-300">
                  <td className="py-2 capitalize font-medium">{row.plan}</td>
                  <td className="py-2 text-right text-slate-400">{row.count}</td>
                  <td className="py-2 text-right">{fmt(parseInt(row.total_cents, 10))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent invoices */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-rose-400" />
          <h2 className="text-sm font-semibold text-white">Recent Invoices</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-white/5">
              <th className="pb-2 text-left font-medium">Invoice #</th>
              <th className="pb-2 text-left font-medium">Period</th>
              <th className="pb-2 text-right font-medium">Amount</th>
              <th className="pb-2 text-left pl-4 font-medium">Status</th>
              <th className="pb-2 text-left font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {revenue.recent_invoices.map((inv) => (
              <tr key={inv.invoice_number} className="text-slate-300">
                <td className="py-2 font-mono text-xs">{inv.invoice_number}</td>
                <td className="py-2 text-slate-500 text-xs">
                  {new Date(inv.period_start).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                </td>
                <td className="py-2 text-right">${(inv.total_amount_cents / 100).toFixed(2)}</td>
                <td className="py-2 pl-4">
                  <span className={`capitalize text-xs ${inv.status === 'paid' ? 'text-emerald-400' : inv.status === 'open' ? 'text-amber-400' : 'text-slate-500'}`}>
                    {inv.status}
                  </span>
                </td>
                <td className="py-2 text-xs text-slate-500">
                  {new Date(inv.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {revenue.recent_invoices.length === 0 && <p className="text-xs text-slate-500 py-4">No invoices yet.</p>}
      </div>
    </div>
  );
}
