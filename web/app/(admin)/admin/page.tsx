'use client';

import { useEffect, useState } from 'react';
import { Users, Key, Fingerprint, AlertTriangle, Activity, TrendingUp, Loader2 } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';

interface Health {
  status: string;
  db: { time: string; connections: number };
  stats: {
    developer_count: number;
    active_key_count: number;
    identity_count: number;
    sessions_24h: number;
    failures_24h: number;
    failure_rate_percent: number;
  };
}

interface Revenue {
  mrr_cents: number;
  arr_cents: number;
  plan_breakdown: { plan: string; status: string; count: string; total_cents: string }[];
}

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const statCard = (icon: React.ReactNode, label: string, value: string | number, sub?: string, accent = 'indigo') => {
  const colours: Record<string, string> = {
    indigo: 'bg-indigo-500/10 text-indigo-400',
    rose: 'bg-rose-500/10 text-rose-400',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-400',
  };
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
      <div className={`w-8 h-8 rounded-lg ${colours[accent]} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-sm text-slate-400 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-slate-600 mt-1">{sub}</div>}
    </div>
  );
};

export default function AdminOverviewPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminApi.get<Health>('/v1/admin/health'),
      adminApi.get<Revenue>('/v1/admin/revenue'),
    ])
      .then(([h, r]) => { setHealth(h); setRevenue(r); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 text-rose-400 animate-spin" />
      </div>
    );
  }

  const s = health?.stats;
  const failureHigh = (s?.failure_rate_percent ?? 0) > 10;

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="text-slate-400 text-sm mt-1">Platform health and key metrics at a glance.</p>
      </div>

      {/* Revenue row */}
      {revenue && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {statCard(<TrendingUp className="w-4 h-4" />, 'MRR', fmt(revenue.mrr_cents), 'monthly recurring', 'emerald')}
          {statCard(<TrendingUp className="w-4 h-4" />, 'ARR', fmt(revenue.arr_cents), 'annualised', 'emerald')}
          {s && statCard(<Users className="w-4 h-4" />, 'Developers', s.developer_count.toLocaleString(), 'registered accounts', 'indigo')}
          {s && statCard(<Key className="w-4 h-4" />, 'Active API Keys', s.active_key_count.toLocaleString(), 'across all accounts', 'indigo')}
        </div>
      )}

      {/* Ops row */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {statCard(<Fingerprint className="w-4 h-4" />, 'Identities', s.identity_count.toLocaleString(), 'verified records', 'indigo')}
          {statCard(<Activity className="w-4 h-4" />, 'Sessions (24h)', s.sessions_24h.toLocaleString(), 'verification attempts', 'indigo')}
          {statCard(
            <AlertTriangle className="w-4 h-4" />,
            'Failures (24h)',
            s.failures_24h.toLocaleString(),
            `${s.failure_rate_percent}% failure rate`,
            failureHigh ? 'rose' : 'amber'
          )}
          {statCard(<Activity className="w-4 h-4" />, 'DB Connections', health!.db.connections, 'active pg connections', 'indigo')}
        </div>
      )}

      {/* Plan breakdown */}
      {revenue && revenue.plan_breakdown.length > 0 && (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Subscriptions by Plan</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 text-left border-b border-white/5">
                  <th className="pb-2 pr-6">Plan</th>
                  <th className="pb-2 pr-6">Status</th>
                  <th className="pb-2 pr-6 text-right">Count</th>
                  <th className="pb-2 text-right">MRR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {revenue.plan_breakdown.map((row, i) => (
                  <tr key={i} className="text-slate-300">
                    <td className="py-2 pr-6 capitalize font-medium">{row.plan}</td>
                    <td className="py-2 pr-6 text-slate-500 capitalize">{row.status}</td>
                    <td className="py-2 pr-6 text-right">{row.count}</td>
                    <td className="py-2 text-right">{fmt(parseInt(row.total_cents, 10))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
