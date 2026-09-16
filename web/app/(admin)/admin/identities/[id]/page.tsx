'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Fingerprint, ArrowLeft, Shield, AlertOctagon, Clock,
  CheckCircle2, XCircle, Loader2, Ban, RefreshCw,
} from 'lucide-react';
import { adminApi } from '@/lib/admin-api';

interface Identity {
  id: string;
  phone: string;
  full_name: string;
  id_type: string;
  id_number_hash: string;
  nationality: string;
  verification_level: number;
  trust_score: number;
  aml_status: string;
  is_blacklisted: boolean;
  provider_used: string | null;
  created_at: string;
  updated_at: string;
}

interface Session {
  id: string;
  type: string;
  status: string;
  risk_level: string;
  created_at: string;
  completed_at: string | null;
}

interface BlacklistEntry {
  id: string;
  type: string;
  reason: string;
  scope: string;
  added_by: string;
  created_at: string;
}

interface DetailResponse {
  identity: Identity;
  sessions: Session[];
  blacklist_entries: BlacklistEntry[];
}

function Badge({ label, colour }: { label: string; colour: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colour}`}>
      {label}
    </span>
  );
}

function amlColour(status: string) {
  if (status === 'clear') return 'bg-emerald-500/10 text-emerald-400';
  if (status === 'flagged') return 'bg-rose-500/10 text-rose-400';
  return 'bg-slate-500/10 text-slate-400';
}

function sessionStatusIcon(status: string) {
  if (status === 'approved') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (status === 'rejected' || status === 'failed') return <XCircle className="w-4 h-4 text-rose-400" />;
  return <Clock className="w-4 h-4 text-slate-400" />;
}

function riskColour(risk: string) {
  if (risk === 'low') return 'bg-emerald-500/10 text-emerald-400';
  if (risk === 'medium') return 'bg-yellow-500/10 text-yellow-400';
  if (risk === 'high') return 'bg-rose-500/10 text-rose-400';
  return 'bg-slate-500/10 text-slate-400';
}

export default function IdentityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rescreening, setRescreening] = useState(false);
  const [rescreenMsg, setRescreenMsg] = useState('');

  function load() {
    adminApi.get<DetailResponse>(`/v1/admin/identities/${id}`)
      .then(setData)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [id]);

  async function handleRescreen() {
    setRescreening(true);
    setRescreenMsg('');
    try {
      await adminApi.post(`/v1/admin/identities/${id}/rescreen`, {});
      setRescreenMsg('Re-screened. Refreshing…');
      setLoading(true);
      load();
    } catch (err) {
      setRescreenMsg((err as Error).message);
    } finally {
      setRescreening(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-rose-400 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <p className="text-red-400">{error || 'Identity not found'}</p>
        <button onClick={() => router.back()} className="mt-4 text-sm text-slate-400 hover:text-white">← Back</button>
      </div>
    );
  }

  const { identity: i, sessions, blacklist_entries } = data;

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/identities" className="text-slate-500 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <Fingerprint className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">{i.full_name || '-'}</h1>
            <p className="text-sm text-slate-400">{i.phone}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {i.is_blacklisted && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-full px-3 py-1">
              <Ban className="w-3.5 h-3.5" /> Blacklisted
            </span>
          )}
          <button
            onClick={handleRescreen}
            disabled={rescreening}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
          >
            {rescreening ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Re-screen AML
          </button>
        </div>
      </div>
      {rescreenMsg && (
        <p className="text-xs text-slate-400">{rescreenMsg}</p>
      )}

      {/* Identity info */}
      <div className="bg-zinc-900 border border-white/10 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Identity Details</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {[
            ['ID', i.id.slice(0, 8) + '…'],
            ['Nationality', i.nationality?.toUpperCase() ?? '-'],
            ['ID Type', i.id_type ?? '-'],
            ['ID Hash', i.id_number_hash ? '••••' + i.id_number_hash.slice(-6) : '-'],
            ['Provider', i.provider_used?.replace(/_/g, ' ') ?? 'unknown'],
            ['Verified', new Date(i.created_at).toLocaleDateString()],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-xs text-slate-500 mb-0.5">{label}</div>
              <div className="text-white font-medium">{value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 mt-5 pt-4 border-t border-white/10">
          <div>
            <div className="text-xs text-slate-500 mb-1">Level</div>
            <div className="flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-indigo-400" />
              <span className="text-white font-semibold">{i.verification_level}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">Trust Score</div>
            <div className={`font-semibold ${i.trust_score >= 70 ? 'text-emerald-400' : i.trust_score >= 40 ? 'text-yellow-400' : 'text-rose-400'}`}>
              {i.trust_score}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">AML Status</div>
            <Badge label={i.aml_status ?? 'not_screened'} colour={amlColour(i.aml_status)} />
          </div>
        </div>
      </div>

      {/* Sessions */}
      <div className="bg-zinc-900 border border-white/10 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">
          Verification Sessions <span className="text-slate-500 font-normal">({sessions.length})</span>
        </h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-slate-500">No sessions found.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-2.5">
                  {sessionStatusIcon(s.status)}
                  <div>
                    <div className="text-sm text-white capitalize">{s.type?.replace(/_/g, ' ') ?? '-'}</div>
                    <div className="text-xs text-slate-500">{new Date(s.created_at).toLocaleString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {s.risk_level && s.risk_level !== 'unknown' && (
                    <Badge label={s.risk_level} colour={riskColour(s.risk_level)} />
                  )}
                  <span className="text-xs text-slate-500 capitalize">{s.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Blacklist entries */}
      {blacklist_entries.length > 0 && (
        <div className="bg-zinc-900 border border-rose-500/20 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-rose-400 mb-4 flex items-center gap-2">
            <AlertOctagon className="w-4 h-4" /> Blacklist Entries
          </h2>
          <div className="space-y-3">
            {blacklist_entries.map((b) => (
              <div key={b.id} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium capitalize">{b.type}</span>
                  <span className="text-xs text-slate-500">{new Date(b.created_at).toLocaleDateString()}</span>
                </div>
                <div className="text-slate-400 text-xs mt-0.5">{b.reason} · {b.scope} · by {b.added_by}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
