'use client';

import { useEffect, useState } from 'react';
import { Key, CheckCircle, TrendingUp, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';

interface Overview {
  total_keys: number;
  active_keys: number;
  total_verifications: number;
  recent_events: { type: string; created_at: string }[];
  environment: 'sandbox' | 'production';
  fraud_flags: number;
}

const EVENT_LABELS: Record<string, string> = {
  otp_sent: 'OTP sent',
  otp_confirmed: 'OTP confirmed',
  id_uploaded: 'ID document uploaded',
  face_submitted: 'Face submitted',
  vit_issued: 'VIT issued — identity verified',
  verification_failed: 'Verification failed',
  identity_connected: 'Identity connected to platform',
  trust_updated: 'Trust score updated',
};

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-slate-400">{label}</span>
        <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-indigo-400" />
        </div>
      </div>
      <div className="text-3xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Overview>('/v1/developer/overview')
      .then(setOverview)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const d = overview ?? { total_keys: 0, active_keys: 0, total_verifications: 0, recent_events: [], environment: 'sandbox' as const, fraud_flags: 0 };
  const isProd = d.environment === 'production';

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="text-slate-400 text-sm mt-1">Your VerifyAfrica platform at a glance</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Key} label="Active API Keys" value={d.active_keys} sub={`${d.total_keys} total`} />
        <StatCard icon={CheckCircle} label="Verifications (month)" value={d.total_verifications.toLocaleString()} />
        <StatCard
          icon={TrendingUp}
          label="Environment"
          value={isProd ? 'Production' : 'Sandbox'}
          sub={isProd ? 'Live verifications active' : 'Switch to production when ready'}
        />
        <StatCard
          icon={AlertTriangle}
          label="Fraud flags"
          value={d.fraud_flags}
          sub={d.fraud_flags === 0 ? 'All clear' : `${d.fraud_flags} flagged identit${d.fraud_flags === 1 ? 'y' : 'ies'}`}
        />
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white">Recent activity</h2>
        </div>
        {d.recent_events.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-slate-500 text-sm">No events yet. Create an API key and run your first verification.</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {d.recent_events.map((ev, i) => (
              <li key={i} className="flex items-center justify-between px-6 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                  <span className="text-sm text-slate-300">
                    {EVENT_LABELS[ev.type] ?? ev.type}
                  </span>
                </div>
                <span className="text-xs text-slate-500">{timeAgo(ev.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
