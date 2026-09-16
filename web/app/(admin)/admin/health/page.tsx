'use client';

import { useEffect, useState } from 'react';
import { Activity, CheckCircle, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
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

export default function AdminHealthPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  function load() {
    setLoading(true);
    adminApi.get<Health>('/v1/admin/health')
      .then((h) => { setHealth(h); setLastFetch(new Date()); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const failureRate = health?.stats.failure_rate_percent ?? 0;
  const statusOk = health?.status === 'ok';

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-rose-400" />
          <h1 className="text-2xl font-bold text-white">System Health</h1>
        </div>
        <div className="flex items-center gap-3">
          {lastFetch && <span className="text-xs text-slate-500">Last updated {lastFetch.toLocaleTimeString()}</span>}
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading && !health ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-rose-400 animate-spin" /></div>
      ) : health ? (
        <div className="space-y-5">
          {/* Overall status */}
          <div className={`flex items-center gap-4 p-5 rounded-xl border ${statusOk ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
            {statusOk
              ? <CheckCircle className="w-6 h-6 text-emerald-400" />
              : <AlertTriangle className="w-6 h-6 text-red-400" />
            }
            <div>
              <div className={`font-semibold ${statusOk ? 'text-emerald-400' : 'text-red-400'}`}>
                {statusOk ? 'All systems operational' : 'Degraded state detected'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                DB time: {new Date(health.db.time).toLocaleTimeString()}
              </div>
            </div>
          </div>

          {/* DB */}
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Database</h2>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Active connections</span>
              <span className={`font-medium ${health.db.connections > 80 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {health.db.connections}
              </span>
            </div>
          </div>

          {/* Stats grid */}
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Platform Totals</h2>
            <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
              {[
                ['Registered developers', health.stats.developer_count.toLocaleString()],
                ['Active API keys', health.stats.active_key_count.toLocaleString()],
                ['Verified identities', health.stats.identity_count.toLocaleString()],
                ['Sessions (24h)', health.stats.sessions_24h.toLocaleString()],
                ['Failures (24h)', health.stats.failures_24h.toLocaleString()],
                ['Failure rate', `${health.stats.failure_rate_percent}%`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between border-b border-white/5 pb-3">
                  <span className="text-slate-400">{label}</span>
                  <span className={`font-medium ${label.includes('Failure') && failureRate > 10 ? 'text-rose-400' : 'text-white'}`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {failureRate > 10 && (
            <div className="flex items-start gap-3 bg-rose-500/5 border border-rose-500/20 rounded-xl p-4">
              <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
              <p className="text-sm text-rose-300">
                Failure rate is above 10% in the last 24 hours. Investigate recent verification sessions for upstream API issues.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
