'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Loader2, Plus } from 'lucide-react';
import { evalCall } from '@/lib/eval-api';

interface Study { id: string; name: string; purpose: string; retention_days: number; status: string; created_at: string; participants: number; genuine: number; attacks: number }

export default function EvaluationPage() {
  const [studies, setStudies] = useState<Study[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', purpose: '', retention_days: 180 });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    evalCall<{ studies: Study[] }>('/studies').then((r) => setStudies(r.studies)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await evalCall('/studies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      setOpen(false); setForm({ name: '', purpose: '', retention_days: 180 }); load();
    } catch (err) { setError((err as Error).message); }
    setBusy(false);
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center"><ClipboardList className="w-5 h-5 text-indigo-400" /></div>
          <div>
            <h1 className="text-2xl font-bold text-white">Accuracy Studies</h1>
            <p className="text-slate-400 text-base mt-0.5">Measure how often the live scan lets attacks through and wrongly stops real people, with confidence intervals and a skin-tone breakdown.</p>
          </div>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="shrink-0 inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-ink font-semibold text-sm px-4 py-2.5 rounded-lg">
          <Plus className="w-4 h-4" /> New study
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-base text-slate-300 space-y-2">
        <p><strong className="text-white">Why this matters.</strong> A verification product is judged on two numbers: the share of attacks it accepts, and the share of real people it stops. Buyers and test labs ask for them with confidence intervals. This is where you produce them.</p>
        <p className="text-slate-400">Participants are pseudonymous (a code only, never a name, phone or email). Frames are stored encrypted, deleted on schedule, and deleted immediately if a participant withdraws.</p>
      </div>

      {open && (
        <form onSubmit={create} className="mt-6 rounded-xl border border-white/10 bg-slate-900 p-5 space-y-4">
          <div>
            <label htmlFor="sname" className="block text-base text-slate-300 mb-1.5">Study name</label>
            <input id="sname" required minLength={3} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Pilot, Accra, November" className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
          </div>
          <div>
            <label htmlFor="spurpose" className="block text-base text-slate-300 mb-1.5">Purpose (shown to participants when you ask for consent)</label>
            <textarea id="spurpose" required minLength={10} maxLength={1000} rows={3} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              placeholder="To measure how accurately AfriVerify tells real people from photos and videos, so it can be improved for African users." className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
          </div>
          <div>
            <label htmlFor="sret" className="block text-base text-slate-300 mb-1.5">Keep images for (days, 7 to 730)</label>
            <input id="sret" type="number" min={7} max={730} value={form.retention_days} onChange={(e) => setForm({ ...form, retention_days: Number(e.target.value) })}
              className="w-40 bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
            <p className="text-sm text-slate-400 mt-1.5">Measurements stay after the images are deleted. Shorter is safer for privacy.</p>
          </div>
          {error && <p role="alert" className="text-base text-red-400">{error}</p>}
          <button disabled={busy} className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-ink font-semibold text-sm px-4 py-2.5 rounded-lg">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Create study
          </button>
        </form>
      )}

      {error && !open && <p role="alert" className="mt-4 text-base text-red-400">{error}</p>}

      <div className="mt-8 space-y-3">
        {studies === null && !error && <p className="text-slate-400 text-base">Loading...</p>}
        {studies?.length === 0 && <p className="text-slate-400 text-base">No studies yet. Create one to start measuring.</p>}
        {studies?.map((s) => (
          <Link key={s.id} href={`/dashboard/evaluation/${s.id}`} className="block rounded-xl border border-white/10 bg-slate-900 p-5 hover:border-indigo-500/40 transition-colors">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-white font-semibold text-lg">{s.name}</h2>
              <span className={`text-sm px-2.5 py-1 rounded-full border ${s.status === 'open' ? 'text-green-300 border-green-500/30 bg-green-500/10' : 'text-slate-300 border-white/15'}`}>{s.status}</span>
            </div>
            <p className="text-base text-slate-400 mt-1 line-clamp-2">{s.purpose}</p>
            <p className="text-base text-slate-300 mt-3">{s.participants} participants · {s.genuine} genuine captures · {s.attacks} attack captures</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
