'use client';

import { useEffect, useState } from 'react';
import { BarChart2, TrendingUp, AlertTriangle, CreditCard, CheckCircle2, FileDown, Zap } from 'lucide-react';
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

interface BillingKey {
  id: string;
  platform_name: string;
  environment: string;
  tier: string;
  monthly_limit: number;
  verifications_this_month: number;
}

interface Subscription {
  api_key_id: string;
  plan: string;
  status: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  amount_cents: number;
  overage_verifications: number;
  overage_amount_cents: number;
  total_amount_cents: number;
  verifications_included: number;
  currency: string;
  period_start: string;
  period_end: string;
  paid_at: string | null;
  created_at: string;
  api_key_id: string;
}

interface PlanPricing {
  amountCents: number;
  currency: string;
  monthlyLimit: number;
  label: string;
}

interface BillingData {
  keys: BillingKey[];
  subscriptions: Subscription[];
  invoices: Invoice[];
  plans: Record<string, PlanPricing>;
}

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
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

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(Math.round((used / limit) * 100), 100) : 0;
  const colour = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-indigo-500';
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>{used.toLocaleString()} used</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${colour}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-slate-600 mt-1">{limit.toLocaleString()} / month</div>
    </div>
  );
}

export default function UsagePage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [chartData, setChartData] = useState<{ day: string; calls: number }[]>(buildLast7Days([]));
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [subscribingKeyId, setSubscribingKeyId] = useState<string | null>(null);
  const [subscribingPlan, setSubscribingPlan] = useState<string | null>(null);
  const [subscribeError, setSubscribeError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<Overview>('/v1/developer/overview'),
      api.get<{ daily: DailyRow[] }>('/v1/developer/usage/daily'),
      api.get<BillingData>('/v1/developer/billing'),
    ])
      .then(([ov, daily, bill]) => {
        setOverview(ov);
        setChartData(buildLast7Days(daily.daily));
        setBilling(bill);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleSubscribe(apiKeyId: string, plan: string) {
    setSubscribingKeyId(apiKeyId);
    setSubscribingPlan(plan);
    setSubscribeError('');
    try {
      const { payment_link } = await api.post<{ payment_link: string }>('/v1/developer/billing/subscribe', {
        api_key_id: apiKeyId,
        plan,
        redirect_url: window.location.href,
      });
      window.location.href = payment_link;
    } catch (err) {
      setSubscribeError((err as Error).message ?? 'Could not start checkout');
      setSubscribingKeyId(null);
      setSubscribingPlan(null);
    }
  }

  const totalVerifs = overview?.total_verifications ?? 0;
  const hasActivity = chartData.some((d) => d.calls > 0);

  // Highest-usage key for the top quota bar
  const topKey = billing?.keys.reduce((best, k) => {
    const bPct = best ? (best.verifications_this_month / best.monthly_limit) : -1;
    const kPct = k.monthly_limit > 0 ? (k.verifications_this_month / k.monthly_limit) : 0;
    return kPct > bPct ? k : best;
  }, null as BillingKey | null);
  const topPct = topKey && topKey.monthly_limit > 0
    ? Math.min(Math.round((topKey.verifications_this_month / topKey.monthly_limit) * 100), 100)
    : Math.min(Math.round((totalVerifs / 100) * 100), 100);

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Usage &amp; Billing</h1>
        <p className="text-slate-400 text-sm mt-1">Monthly usage across all your API keys</p>
      </div>

      {topPct >= 80 && (
        <div className="mb-6 flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm px-5 py-4 rounded-xl">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Your most-used key is at {topPct}% of its monthly quota. Upgrade to avoid interruptions — overages are billed at $0.03/verification.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Verifications this month', value: loading ? '—' : totalVerifs.toLocaleString(), icon: TrendingUp },
          { label: 'Monthly limit (top key)', value: loading ? '—' : (topKey?.monthly_limit ?? 100).toLocaleString(), icon: BarChart2 },
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
                <XAxis dataKey="day" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12 }}
                  cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                />
                <Bar dataKey="calls" fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {!hasActivity && (
              <p className="text-xs text-slate-600 text-center mt-3">Timeseries data populates after your first API call</p>
            )}
          </>
        )}
      </div>

      {/* Plans per key */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-sm font-semibold text-white mb-1">Plans &amp; Usage</h3>
        <p className="text-slate-500 text-xs mb-5">Each API key is billed and metered independently.</p>

        {subscribeError && (
          <p className="text-xs text-red-400 mb-4 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {subscribeError}
          </p>
        )}

        {!billing || billing.keys.length === 0 ? (
          <p className="text-slate-500 text-sm">No active API keys yet.</p>
        ) : (
          <div className="space-y-4">
            {billing.keys.map((key) => {
              const sub = billing.subscriptions.find((s) => s.api_key_id === key.id);
              const isActive = sub?.status === 'active';
              const currentPlan = sub?.plan ?? key.tier;

              return (
                <div key={key.id} className="bg-white/[0.02] border border-white/10 rounded-lg px-5 py-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-white">{key.platform_name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-slate-400 capitalize">{key.environment}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {key.tier === 'free' ? 'Sandbox' : key.tier.charAt(0).toUpperCase() + key.tier.slice(1)} plan
                        {sub?.status === 'active' && (
                          <> &middot; renews {new Date(sub.current_period_end).toLocaleDateString()}</>
                        )}
                        {sub?.status === 'past_due' && (
                          <span className="text-amber-400"> &middot; payment due — renew to avoid downgrade</span>
                        )}
                      </div>
                      <UsageBar used={key.verifications_this_month} limit={key.monthly_limit} />
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} active
                        </span>
                      ) : null}

                      {/* Upgrade options — show plans higher than current tier */}
                      {billing.plans.starter && (!isActive || currentPlan === 'free') && (
                        <button
                          onClick={() => handleSubscribe(key.id, 'starter')}
                          disabled={subscribingKeyId === key.id && subscribingPlan === 'starter'}
                          className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          {subscribingKeyId === key.id && subscribingPlan === 'starter'
                            ? 'Redirecting…'
                            : `Starter — ${formatMoney(billing.plans.starter.amountCents, billing.plans.starter.currency)}/mo`}
                        </button>
                      )}
                      {billing.plans.growth && (!isActive || currentPlan === 'free' || currentPlan === 'starter') && (
                        <button
                          onClick={() => handleSubscribe(key.id, 'growth')}
                          disabled={subscribingKeyId === key.id && subscribingPlan === 'growth'}
                          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          {subscribingKeyId === key.id && subscribingPlan === 'growth'
                            ? 'Redirecting…'
                            : `Growth — ${formatMoney(billing.plans.growth.amountCents, billing.plans.growth.currency)}/mo`}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-slate-500 text-xs mt-5">
          Need more than Growth&apos;s {billing?.plans.growth?.monthlyLimit.toLocaleString() ?? '10,000'}/month?{' '}
          <a href="mailto:sales@sankofaapp.com" className="text-indigo-400 hover:text-indigo-300">Contact sales</a>{' '}
          for Enterprise pricing with dedicated SLA.
        </p>
      </div>

      {/* Invoice history */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h3 className="text-sm font-semibold text-white">Invoices</h3>
        </div>
        {!billing || billing.invoices.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-slate-500 text-sm">No invoices yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-white/5">
                  <th className="px-6 py-3 font-medium">Invoice</th>
                  <th className="px-6 py-3 font-medium">Period</th>
                  <th className="px-6 py-3 font-medium">Base</th>
                  <th className="px-6 py-3 font-medium">Overage</th>
                  <th className="px-6 py-3 font-medium">Total</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {billing.invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-3 text-slate-300 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="px-6 py-3 text-slate-400 text-xs">
                      {new Date(inv.period_start).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-3 text-slate-400 font-mono text-xs tabular-nums">
                      {formatMoney(inv.amount_cents, inv.currency)}
                    </td>
                    <td className="px-6 py-3 text-xs tabular-nums">
                      {inv.overage_verifications > 0 ? (
                        <span className="text-amber-400 font-mono">
                          +{formatMoney(inv.overage_amount_cents, inv.currency)}
                          <span className="text-slate-600 ml-1">({inv.overage_verifications.toLocaleString()} extra)</span>
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-300 font-mono text-xs tabular-nums font-medium">
                      {formatMoney(inv.total_amount_cents, inv.currency)}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                        inv.status === 'paid' ? 'bg-green-500/10 text-green-400'
                          : inv.status === 'open' ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-white/5 text-slate-400'
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <a
                        href={`${process.env.NEXT_PUBLIC_API_URL ?? ''}/v1/developer/billing/invoices/${inv.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-white transition-colors"
                        title="Open printable invoice"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
