'use client';

import { useEffect, useState } from 'react';
import { BarChart2, TrendingUp, AlertTriangle } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { api } from '@/lib/api';

interface Overview {
  total_verifications: number;
  active_keys: number;
}

interface DailyRow {
  day: string;
  calls: number;
}

function buildLast7Days(rows: DailyRow[]): { day: string; calls: number }[] {
  const map = new Map(rows.map((r) => [r.day, r.calls]));
  const result: { day: string; calls: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const isoDay = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-GB', { weekday: 'short' });
    result.push({ day: label, calls: map.get(isoDay) ?? 0 });
  }
  return result;
}

export default function UsagePage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [chartData, setChartData] = useState<{ day: string; calls: number }[]>(buildLast7Days([]));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Overview>('/v1/developer/overview'),
      api.get<{ daily: DailyRow[] }>('/v1/developer/usage/daily'),
    ])
      .then(([ov, daily]) => {
        setOverview(ov);
        setChartData(buildLast7Days(daily.daily));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const totalVerifs = overview?.total_verifications ?? 0;
  const limit = 100;
  const pct = Math.min(Math.round((totalVerifs / limit) * 100), 100);
  const hasActivity = chartData.some((d) => d.calls > 0);

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Usage &amp; Billing</h1>
        <p className="text-slate-400 text-sm mt-1">Monthly usage across all your API keys</p>
      </div>

      {pct >= 80 && (
        <div className="mb-6 flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm px-5 py-4 rounded-xl">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          You&apos;ve used {pct}% of your monthly quota. Upgrade to avoid interruptions.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Verifications this month', value: loading ? '—' : totalVerifs.toLocaleString(), icon: TrendingUp },
          { label: 'Monthly limit', value: limit.toLocaleString(), icon: BarChart2 },
          { label: 'Active keys', value: loading ? '—' : String(overview?.active_keys ?? 0), icon: AlertTriangle },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400">{label}</span>
              <Icon className="w-4 h-4 text-slate-600" />
            </div>
            <div className="text-2xl font-bold text-white">{value}</div>
          </div>
        ))}
      </div>

      {/* Quota bar */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-white">Monthly quota</span>
          <span className="text-sm text-slate-400">{pct}% used</span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              pct >= 80 ? 'bg-amber-500' : 'bg-indigo-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-600">
          <span>0</span>
          <span>{limit} (Sandbox)</span>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-sm font-semibold text-white mb-5">API calls — last 7 days</h3>
        {loading ? (
          <div className="flex items-center justify-center h-[180px]">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="day"
                  tick={{ fill: '#475569', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#475569', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    color: '#fff',
                    fontSize: 12,
                  }}
                  cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                />
                <Bar dataKey="calls" fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {!hasActivity && (
              <p className="text-xs text-slate-600 text-center mt-3">
                Timeseries data populates after your first API call
              </p>
            )}
          </>
        )}
      </div>

      {/* Upgrade */}
      <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-6">
        <h3 className="font-semibold text-white mb-1">Need more verifications?</h3>
        <p className="text-slate-400 text-sm mb-4">
          Upgrade to Starter for 2,000/month — or contact us for custom limits.
        </p>
        <a
          href="mailto:sales@orbitverify.africa"
          className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          Upgrade plan
        </a>
      </div>
    </div>
  );
}
