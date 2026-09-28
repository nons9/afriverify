'use client';

import { useEffect, useState } from 'react';
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
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const d = overview ?? {
    total_keys: 0,
    active_keys: 0,
    total_verifications: 0,
    recent_events: [],
    environment: 'sandbox' as const,
    fraud_flags: 0,
  };
  const isProd = d.environment === 'production';

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="text-slate-400 text-sm mt-1">Your AfriVerify platform at a glance</p>
      </div>

      {/* Flat stats row — no boxes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-8 mb-14">
        <div>
          <div className="text-3xl font-bold text-white tabular-nums">{d.active_keys}</div>
          <div className="text-sm text-slate-400 mt-1">Active API keys</div>
          <div className="text-xs text-slate-600 mt-0.5">{d.total_keys} total</div>
        </div>
        <div>
          <div className="text-3xl font-bold text-white tabular-nums">{d.total_verifications.toLocaleString()}</div>
          <div className="text-sm text-slate-400 mt-1">Verifications this month</div>
        </div>
        <div>
          <div className={`text-3xl font-bold tabular-nums ${isProd ? 'text-emerald-400' : 'text-amber-400'}`}>
            {isProd ? 'Production' : 'Sandbox'}
          </div>
          <div className="text-sm text-slate-400 mt-1">Environment</div>
          <div className="text-xs text-slate-600 mt-0.5">
            {isProd ? 'Live verifications active' : 'Switch to production when ready'}
          </div>
        </div>
        <div>
          <div className={`text-3xl font-bold tabular-nums ${d.fraud_flags > 0 ? 'text-rose-400' : 'text-white'}`}>
            {d.fraud_flags}
          </div>
          <div className="text-sm text-slate-400 mt-1">Fraud flags</div>
          <div className="text-xs text-slate-600 mt-0.5">
            {d.fraud_flags === 0 ? 'All clear' : `${d.fraud_flags} flagged`}
          </div>
        </div>
      </div>

      {/* Recent activity — flat list, no card */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Recent activity</h2>
        {d.recent_events.length === 0 ? (
          <p className="text-slate-500 text-sm">No events yet. Create an API key and run your first verification.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {d.recent_events.map((ev, i) => (
              <li key={i} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                  <span className="text-sm text-slate-300">{EVENT_LABELS[ev.type] ?? ev.type}</span>
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
