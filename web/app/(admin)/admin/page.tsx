'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="text-slate-400 text-sm mt-1">Platform health and key metrics at a glance.</p>
      </div>

      {/* Revenue + accounts — flat stats */}
      {revenue && s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-8 mb-14">
          <div>
            <div className="text-3xl font-bold text-emerald-400 tabular-nums">{fmt(revenue.mrr_cents)}</div>
            <div className="text-sm text-slate-400 mt-1">MRR</div>
            <div className="text-xs text-slate-600 mt-0.5">Monthly recurring</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-emerald-400 tabular-nums">{fmt(revenue.arr_cents)}</div>
            <div className="text-sm text-slate-400 mt-1">ARR</div>
            <div className="text-xs text-slate-600 mt-0.5">Annualised</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white tabular-nums">{s.developer_count.toLocaleString()}</div>
            <div className="text-sm text-slate-400 mt-1">Developers</div>
            <div className="text-xs text-slate-600 mt-0.5">Registered accounts</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white tabular-nums">{s.active_key_count.toLocaleString()}</div>
            <div className="text-sm text-slate-400 mt-1">Active API keys</div>
            <div className="text-xs text-slate-600 mt-0.5">Across all accounts</div>
          </div>
        </div>
      )}

      {/* Ops — flat stats */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-8 mb-14">
          <div>
            <div className="text-3xl font-bold text-white tabular-nums">{s.identity_count.toLocaleString()}</div>
            <div className="text-sm text-slate-400 mt-1">Identities</div>
            <div className="text-xs text-slate-600 mt-0.5">Verified records</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white tabular-nums">{s.sessions_24h.toLocaleString()}</div>
            <div className="text-sm text-slate-400 mt-1">Sessions (24h)</div>
            <div className="text-xs text-slate-600 mt-0.5">Verification attempts</div>
          </div>
          <div>
            <div className={`text-3xl font-bold tabular-nums ${failureHigh ? 'text-rose-400' : 'text-amber-400'}`}>
              {s.failures_24h.toLocaleString()}
            </div>
            <div className="text-sm text-slate-400 mt-1">Failures (24h)</div>
            <div className="text-xs text-slate-600 mt-0.5">{s.failure_rate_percent}% failure rate</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white tabular-nums">{health!.db.connections}</div>
            <div className="text-sm text-slate-400 mt-1">DB connections</div>
            <div className="text-xs text-slate-600 mt-0.5">Active pg connections</div>
          </div>
        </div>
      )}

      {/* Plan breakdown — table only, no card wrapper */}
      {revenue && revenue.plan_breakdown.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Subscriptions by plan</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 text-left border-b border-white/[0.08]">
                  <th className="pb-3 pr-8 font-medium">Plan</th>
                  <th className="pb-3 pr-8 font-medium">Status</th>
                  <th className="pb-3 pr-8 font-medium text-right">Count</th>
                  <th className="pb-3 font-medium text-right">MRR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {revenue.plan_breakdown.map((row, i) => (
                  <tr key={i} className="text-slate-300">
                    <td className="py-3 pr-8 capitalize font-medium">{row.plan}</td>
                    <td className="py-3 pr-8 text-slate-500 capitalize">{row.status}</td>
                    <td className="py-3 pr-8 text-right tabular-nums">{row.count}</td>
                    <td className="py-3 text-right tabular-nums">{fmt(parseInt(row.total_cents, 10))}</td>
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
