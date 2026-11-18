'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, Filter, ScanFace } from 'lucide-react';
import { api } from '@/lib/api';
import { REASON_LABEL } from '@/lib/liveness-logic';

interface VerificationEvent {
  id?: string;
  type: string;
  created_at: string;
  api_key_id?: string;
}

interface OverviewData {
  recent_events: VerificationEvent[];
}

interface LivenessInfo {
  required: boolean;
  attempts: number;
  verdict: 'pass' | 'review' | 'fail' | null;
  score: number | null;
  decision: string | null;
  reasons: string[];
  passive_flags: string[];
  face_match: string | null;
  face_match_score: number | null;
}

interface SessionRow {
  id: string;
  created_at: string;
  step: string;
  phone_masked: string;
  platform_user_id: string | null;
  flow_name: string | null;
  liveness: LivenessInfo | null;
}

const STEP_BADGE: Record<string, { label: string; cls: string }> = {
  complete: { label: 'Verified', cls: 'text-green-400 bg-green-500/10' },
  failed: { label: 'Failed', cls: 'text-red-400 bg-red-500/10' },
  processing: { label: 'Processing', cls: 'text-blue-400 bg-blue-500/10' },
  face_scan: { label: 'At face step', cls: 'text-amber-400 bg-amber-500/10' },
  id_upload: { label: 'At ID step', cls: 'text-amber-400 bg-amber-500/10' },
  otp: { label: 'At OTP', cls: 'text-slate-300 bg-white/5' },
  phone: { label: 'Started', cls: 'text-slate-300 bg-white/5' },
};

function LiveScanCell({ l }: { l: LivenessInfo | null }) {
  if (!l) return <span className="text-xs text-slate-600">Not used</span>;
  if (!l.verdict) {
    return <span className="text-xs text-amber-400">{l.required ? 'Required, not attempted' : 'Not attempted'}</span>;
  }
  const tone =
    l.verdict === 'pass' ? 'text-green-400 bg-green-500/10' :
    l.verdict === 'review' ? 'text-amber-400 bg-amber-500/10' : 'text-red-400 bg-red-500/10';
  const chips = [...l.reasons, ...l.passive_flags].filter((r, i, a) => a.indexOf(r) === i);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${tone}`}>
          <ScanFace className="w-3 h-3" />
          {l.verdict === 'pass' ? 'Passed' : l.verdict === 'review' ? 'Review' : 'Failed'}
          {l.score !== null && <span className="opacity-80">{Math.round(l.score)}</span>}
        </span>
        {l.face_match && (
          <span className="text-xs text-slate-400">
            Match: {l.face_match.replace('_', ' ')}
            {l.face_match_score !== null && ` (${Math.round(l.face_match_score)})`}
          </span>
        )}
        {l.attempts > 1 && <span className="text-xs text-slate-500">{l.attempts} attempts</span>}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chips.map((c) => (
            <span key={c} className="text-[11px] text-slate-400 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">
              {REASON_LABEL[c] ?? c.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS: Record<string, { label: string; cls: string; Icon: typeof CheckCircle }> = {
  vit_issued: { label: 'Verified', cls: 'text-green-400 bg-green-500/10', Icon: CheckCircle },
  verification_failed: { label: 'Failed', cls: 'text-red-400 bg-red-500/10', Icon: XCircle },
  otp_confirmed: { label: 'OTP done', cls: 'text-blue-400 bg-blue-500/10', Icon: Clock },
  id_uploaded: { label: 'ID uploaded', cls: 'text-amber-400 bg-amber-500/10', Icon: Clock },
  face_submitted: { label: 'Face done', cls: 'text-purple-400 bg-purple-500/10', Icon: Clock },
  identity_connected: { label: 'Connected', cls: 'text-indigo-400 bg-indigo-500/10', Icon: CheckCircle },
};

function Badge({ type }: { type: string }) {
  const s = STATUS[type] ?? { label: type.replace(/_/g, ' '), cls: 'text-slate-400 bg-white/5', Icon: Clock };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${s.cls}`}>
      <s.Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
}

export default function VerificationsPage() {
  const [events, setEvents] = useState<VerificationEvent[]>([]);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<OverviewData>('/v1/developer/overview')
      .then((d) => setEvents(d.recent_events))
      .catch(console.error)
      .finally(() => setLoading(false));
    api
      .get<{ sessions: SessionRow[] }>('/v1/developer/sessions?limit=25')
      .then((d) => setSessions(d.sessions))
      .catch(() => setSessions([]));
  }, []);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Verifications</h1>
          <p className="text-slate-400 text-sm mt-1">Recent verification events across all platforms</p>
        </div>
        <button className="flex items-center gap-2 border border-white/10 text-slate-300 text-sm px-4 py-2 rounded-lg hover:border-white/20 transition-colors">
          <Filter className="w-4 h-4" /> Filter
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-20">
          <CheckCircle className="w-10 h-10 mx-auto mb-4 text-slate-700" />
          <h3 className="text-white font-medium mb-1">No verifications yet</h3>
          <p className="text-slate-500 text-sm max-w-xs mx-auto">
            Create an API key and initiate your first verification to see events here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead className="border-b border-white/[0.06]">
              <tr>
                {['Status', 'Event', 'Timestamp'].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {events.map((ev, i) => (
                <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-4"><Badge type={ev.type} /></td>
                  <td className="px-5 py-4 text-sm text-slate-300">{ev.type.replace(/_/g, ' ')}</td>
                  <td className="px-5 py-4 text-sm text-slate-500">{fmtDate(ev.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sessions with their live-scan result */}
      <div className="mt-12">
        <h2 className="text-lg font-semibold text-white">Recent sessions</h2>
        <p className="text-slate-400 text-sm mt-1 mb-4">
          Each verification session and its live face scan result: score, face match, and why a scan failed.
        </p>
        {sessions === null ? (
          <div className="h-16 flex items-center"><div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-500">No sessions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-white/[0.06]">
                <tr>
                  {['When', 'Session', 'Phone', 'Flow', 'Live face scan'].map((h) => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {sessions.map((r) => {
                  const b = STEP_BADGE[r.step] ?? { label: r.step, cls: 'text-slate-300 bg-white/5' };
                  return (
                    <tr key={r.id} className="align-top hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4 text-sm text-slate-500 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                      <td className="px-5 py-4"><span className={`inline-flex text-xs px-2.5 py-1 rounded-full font-medium ${b.cls}`}>{b.label}</span></td>
                      <td className="px-5 py-4 text-sm text-slate-300 font-mono">{r.phone_masked}</td>
                      <td className="px-5 py-4 text-sm text-slate-400">{r.flow_name ?? '-'}</td>
                      <td className="px-5 py-4"><LiveScanCell l={r.liveness} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
