'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import { TrustShell } from '@/components/trust-shell';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

interface Day { day: string; availability_pct: number | null; coverage_pct: number; requests: number; errors_5xx: number; error_rate_pct: number | null }
interface StatusData {
  status: 'operational' | 'outage';
  checked_at: string;
  components: Record<string, 'operational' | 'down'>;
  uptime_90d_pct: number | null;
  observed_since: string | null;
  days: Day[];
  method: string;
}

const LABEL: Record<string, string> = { database: 'Database', cache: 'Cache', migrations: 'Release integrity' };

/** Colour is never the only signal: every day also has a text description for screen readers and hover. */
function dayClass(d: Day): string {
  if (d.availability_pct === null) return 'bg-white/10';             // no data: grey, never green
  if (d.availability_pct >= 99.9) return 'bg-green-500';
  if (d.availability_pct >= 99) return 'bg-amber-400';
  return 'bg-red-500';
}
const describe = (d: Day) =>
  d.availability_pct === null
    ? `${d.day}: no data`
    : `${d.day}: ${d.availability_pct}% of checks passed, ${d.coverage_pct}% of the day checked, ${d.errors_5xx} server errors in ${d.requests} requests`;

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState(false);
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const t0 = performance.now();
      try {
        const res = await fetch(`${API}/v1/status`, { cache: 'no-store' });
        if (!res.ok) throw new Error('bad');
        const j = (await res.json()) as StatusData;
        if (alive) { setData(j); setError(false); setMs(Math.round(performance.now() - t0)); }
      } catch {
        if (alive) setError(true);
      }
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const ok = data?.status === 'operational';
  const measured = data?.days.filter((d) => d.availability_pct !== null).length ?? 0;

  return (
    <TrustShell wide title="Status" subtitle="What is true right now, and a record of what we measured. Gaps are shown as gaps.">
      {error && !data && (
        <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-5 text-base text-red-100 flex gap-3">
          <XCircle className="w-6 h-6 shrink-0" aria-hidden />
          <p>We could not reach the status service from your browser. That can mean the API is down or your connection is. Try again in a moment, or email <a className="underline" href="mailto:support@sankofaapp.com">support@sankofaapp.com</a>.</p>
        </div>
      )}
      {!data && !error && <div className="flex items-center gap-3 text-base text-slate-300" role="status"><Loader2 className="w-5 h-5 animate-spin" aria-hidden /> Checking...</div>}

      {data && (
        <>
          <div className={`rounded-xl border p-6 flex items-center gap-4 ${ok ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/40 bg-red-500/10'}`} role="status">
            {ok ? <CheckCircle2 className="w-8 h-8 text-green-300 shrink-0" aria-hidden /> : <AlertTriangle className="w-8 h-8 text-red-300 shrink-0" aria-hidden />}
            <div>
              <p className="text-xl font-semibold text-white">{ok ? 'All systems operational' : 'We are having a problem'}</p>
              <p className="text-base text-slate-200 mt-1">
                Checked {new Date(data.checked_at).toLocaleTimeString()}{ms !== null ? ` · answered in ${ms} ms from your browser` : ''}. Refreshes every 30 seconds.
              </p>
            </div>
          </div>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Components</h2>
            <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/10">
              <li className="flex items-center justify-between px-5 py-3 text-base"><span className="text-white">API</span><span className="text-green-300">Operational</span></li>
              {Object.entries(data.components).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between px-5 py-3 text-base">
                  <span className="text-white">{LABEL[k] ?? k}</span>
                  <span className={v === 'operational' ? 'text-green-300' : 'text-red-300'}>{v === 'operational' ? 'Operational' : 'Down'}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-1">Last 90 days</h2>
            <p className="text-base text-slate-300 mb-4">
              {data.uptime_90d_pct === null
                ? 'No history yet.'
                : <>Availability across the {measured} day{measured === 1 ? '' : 's'} measured: <strong className="text-white">{data.uptime_90d_pct}%</strong>{data.observed_since ? ` (recording since ${data.observed_since})` : ''}.</>}
            </p>
            <div className="flex gap-[3px] items-end" role="img" aria-label={`Availability for each of the last 90 days. ${measured} days have data; the rest are shown grey because nothing was measured.`}>
              {data.days.map((d) => <span key={d.day} title={describe(d)} className={`h-10 flex-1 rounded-sm ${dayClass(d)}`} />)}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-base text-slate-300">
              <span><span className="inline-block w-3 h-3 rounded-sm bg-green-500 mr-2 align-middle" />99.9% or better</span>
              <span><span className="inline-block w-3 h-3 rounded-sm bg-amber-400 mr-2 align-middle" />99% to 99.9%</span>
              <span><span className="inline-block w-3 h-3 rounded-sm bg-red-500 mr-2 align-middle" />below 99%</span>
              <span><span className="inline-block w-3 h-3 rounded-sm bg-white/10 mr-2 align-middle" />no data (not counted as uptime)</span>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-2 text-base text-slate-300 leading-relaxed">
            <h2 className="text-lg font-semibold text-white">How to read this</h2>
            <p>{data.method}</p>
            <p>This record began on {data.observed_since ?? 'today'}. Until it is longer, treat it as a start, not a track record. For an incident, email <a className="underline" href="mailto:support@sankofaapp.com">support@sankofaapp.com</a>.</p>
          </section>
        </>
      )}
    </TrustShell>
  );
}
