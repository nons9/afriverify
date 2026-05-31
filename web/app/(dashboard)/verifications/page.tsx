'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, Filter } from 'lucide-react';
import { api } from '@/lib/api';

interface VerificationEvent {
  id?: string;
  type: string;
  created_at: string;
  api_key_id?: string;
}

interface OverviewData {
  recent_events: VerificationEvent[];
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<OverviewData>('/v1/developer/overview')
      .then((d) => setEvents(d.recent_events))
      .catch(console.error)
      .finally(() => setLoading(false));
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

      <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
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
              <thead className="border-b border-white/10">
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
              <tbody className="divide-y divide-white/5">
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
      </div>
    </div>
  );
}
