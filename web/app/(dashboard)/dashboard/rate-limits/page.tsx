'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  Gauge,
  AlertTriangle,
  Bell,
  BellOff,
  RefreshCw,
  TrendingUp,
  Zap,
  Clock,
} from 'lucide-react';

interface RateLimitTier {
  endpoint: string;
  label: string;
  limit: number;
  window_seconds: number;
  current_usage: number;
  reset_at: string;
}

interface AlertRule {
  id: string;
  endpoint: string;
  threshold_pct: number;
  notify_email: boolean;
  enabled: boolean;
}

function pct(usage: number, limit: number) {
  return limit === 0 ? 0 : Math.min(100, Math.round((usage / limit) * 100));
}

function fmtWindow(secs: number) {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${secs / 60}m`;
  return `${secs / 3600}h`;
}

function fmtReset(resetAt: string) {
  const diff = Math.max(0, Math.floor((new Date(resetAt).getTime() - Date.now()) / 1000));
  if (diff < 60) return `${diff}s`;
  return `${Math.floor(diff / 60)}m ${diff % 60}s`;
}

function UsageBar({ usage, limit }: { usage: number; limit: number }) {
  const p = pct(usage, limit);
  const color = p >= 90 ? 'bg-red-500' : p >= 70 ? 'bg-amber-500' : 'bg-indigo-500';
  return (
    <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${p}%` }}
      />
    </div>
  );
}

function RateLimitCard({ tier, onRefresh }: { tier: RateLimitTier; onRefresh: () => void }) {
  const [timeLeft, setTimeLeft] = useState(fmtReset(tier.reset_at));
  const p = pct(tier.current_usage, tier.limit);

  useEffect(() => {
    const interval = setInterval(() => setTimeLeft(fmtReset(tier.reset_at)), 1000);
    return () => clearInterval(interval);
  }, [tier.reset_at]);

  return (
    <div className={`bg-slate-900 border rounded-xl p-5 ${p >= 90 ? 'border-red-500/40' : 'border-white/10'}`}>
      {p >= 90 && (
        <div className="flex items-center gap-1.5 text-xs text-red-400 mb-3">
          <AlertTriangle className="w-3.5 h-3.5" />
          Approaching limit
        </div>
      )}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{tier.label}</h3>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{tier.endpoint}</p>
        </div>
        <button
          onClick={onRefresh}
          className="p-1.5 text-slate-600 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        <UsageBar usage={tier.current_usage} limit={tier.limit} />
        <div className="flex items-center justify-between text-xs">
          <span className={p >= 90 ? 'text-red-400 font-medium' : 'text-slate-300'}>
            {tier.current_usage.toLocaleString()} / {tier.limit.toLocaleString()} requests
          </span>
          <span className="text-slate-500">{p}%</span>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/5 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Window: {fmtWindow(tier.window_seconds)}
        </span>
        <span className="flex items-center gap-1 ml-auto">
          <Zap className="w-3 h-3" />
          Resets in {timeLeft}
        </span>
      </div>
    </div>
  );
}

export default function RateLimitsPage() {
  const [tiers, setTiers] = useState<RateLimitTier[]>([]);
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingAlert, setSavingAlert] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [tierData, alertData] = await Promise.all([
        api.get<{ tiers: RateLimitTier[] }>('/developer/rate-limits'),
        api.get<{ rules: AlertRule[] }>('/developer/rate-limits/alerts'),
      ]);
      setTiers(tierData.tiers ?? []);
      setAlerts(alertData.rules ?? []);
    } catch {
      setTiers([]);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function toggleAlert(rule: AlertRule) {
    setSavingAlert(rule.id);
    try {
      const updated = { ...rule, enabled: !rule.enabled };
      await api.patch(`/developer/rate-limits/alerts/${rule.id}`, { enabled: updated.enabled });
      setAlerts(prev => prev.map(r => r.id === rule.id ? updated : r));
    } finally {
      setSavingAlert(null);
    }
  }

  async function updateThreshold(rule: AlertRule, threshold_pct: number) {
    setSavingAlert(rule.id);
    try {
      await api.patch(`/developer/rate-limits/alerts/${rule.id}`, { threshold_pct });
      setAlerts(prev => prev.map(r => r.id === rule.id ? { ...r, threshold_pct } : r));
    } finally {
      setSavingAlert(null);
    }
  }

  const criticalCount = tiers.filter(t => pct(t.current_usage, t.limit) >= 90).length;
  const warnCount = tiers.filter(t => { const p = pct(t.current_usage, t.limit); return p >= 70 && p < 90; }).length;
  const avgUsage = tiers.length
    ? Math.round(tiers.reduce((s, t) => s + pct(t.current_usage, t.limit), 0) / tiers.length)
    : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Rate Limits</h1>
          <p className="text-sm text-slate-400 mt-0.5">Monitor API usage against your plan limits</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Endpoints', value: tiers.length, icon: Gauge, color: 'text-indigo-400' },
          { label: 'Critical (≥90%)', value: criticalCount, icon: AlertTriangle, color: criticalCount > 0 ? 'text-red-400' : 'text-slate-500' },
          { label: 'Warning (≥70%)', value: warnCount, icon: TrendingUp, color: warnCount > 0 ? 'text-amber-400' : 'text-slate-500' },
          { label: 'Avg usage', value: loading ? '—' : `${avgUsage}%`, icon: TrendingUp, color: 'text-emerald-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-slate-900 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className="text-2xl font-bold text-white">{loading ? '—' : value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Rate limit tiers */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">Current usage</h2>
        {loading ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-slate-900 border border-white/10 rounded-xl p-5 h-32 animate-pulse" />
            ))}
          </div>
        ) : tiers.length === 0 ? (
          <div className="bg-slate-900 border border-white/10 rounded-xl p-8 text-center">
            <Gauge className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No rate limit data available</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {tiers.map(tier => (
              <RateLimitCard key={tier.endpoint} tier={tier} onRefresh={load} />
            ))}
          </div>
        )}
      </div>

      {/* Alert rules */}
      <div className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-white/10">
          <Bell className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">Alert rules</h2>
          <span className="ml-auto text-xs text-slate-500">Email when usage exceeds threshold</span>
        </div>

        {loading ? (
          <div className="p-6 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="p-8 text-center">
            <Bell className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No alert rules configured</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {alerts.map(rule => (
              <div key={rule.id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{rule.endpoint}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Alert when &ge;{' '}
                    <select
                      value={rule.threshold_pct}
                      onChange={e => updateThreshold(rule, Number(e.target.value))}
                      disabled={savingAlert === rule.id}
                      className="bg-slate-800 border border-white/10 rounded px-1 py-0.5 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                    >
                      {[50, 70, 80, 90, 95].map(v => (
                        <option key={v} value={v}>{v}%</option>
                      ))}
                    </select>{' '}
                    of limit used
                  </p>
                </div>
                {savingAlert === rule.id ? (
                  <div className="w-4 h-4 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <button
                    onClick={() => toggleAlert(rule)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      rule.enabled
                        ? 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20'
                        : 'bg-slate-800 text-slate-500 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    {rule.enabled ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                    {rule.enabled ? 'On' : 'Off'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
