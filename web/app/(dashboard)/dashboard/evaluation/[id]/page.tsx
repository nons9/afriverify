'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, Loader2, ShieldAlert, Trash2, UserPlus } from 'lucide-react';
import LiveFaceCapture, { DemoResult } from '@/components/live-face-capture';
import { evalCall } from '@/lib/eval-api';
import { getSession } from '@/lib/auth';
import type { ChallengeType } from '@/lib/liveness-logic';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

interface Participant { id: string; code: string; age_band: string | null; gender: string | null; skin_tone: number | null; country: string | null; withdrawn_at: string | null; captures: number }
interface Study { id: string; name: string; purpose: string; retention_days: number; status: string; consent_version: string; participants: Participant[]; attack_types: string[]; lighting: string[] }
interface Rate { k: number; n: number; rate: number | null; low: number | null; high: number | null }
interface Metrics {
  totals: { genuine: number; attacks: number };
  bpcer: { strict: Rate; hard: Rate };
  apcer: { overall: Rate; by_attack_type: Record<string, Rate>; worst_attack_type: string | null };
  by_skin_group: Record<string, { genuine: number; bpcer_strict: Rate; bpcer_hard: Rate }>;
  by_lighting: Record<string, { genuine: number; attacks: number; bpcer_strict: Rate; apcer: Rate }>;
  by_profile: Record<string, { genuine: number; attacks: number; bpcer_strict: Rate; apcer: Rate }>;
  flash: { genuine: Record<string, number>; attacks: Record<string, number> };
  adequacy: { ok: boolean; notes: string[] };
}
interface Recent { id: string; participant: string; label: string; attack_type: string | null; lighting: string; device: string | null; verdict: string; liveness_score: number | null; created_at: string }
type EvalResult = Omit<DemoResult, 'stored'> & { stored: boolean; capture_id: string; outcome: 'accepted' | 'stopped_for_review' | 'rejected' | 'BREACH' | 'defended'; ground_truth: { label: string; attack_type: string | null } };

const pretty = (s: string) => s.replace(/_/g, ' ');
const pct = (r: Rate) => (r.rate === null ? 'no data' : `${(r.rate * 100).toFixed(1)}%`);
const ci = (r: Rate) => (r.low === null || r.high === null ? '' : `95% range ${(r.low * 100).toFixed(1)} to ${(r.high * 100).toFixed(1)}%`);

const CONSENT_POINTS = [
  'What the study is for (the purpose shown above).',
  'That their camera frames, a short video of their face, are captured and stored encrypted for the retention period.',
  'That they are known only by a code. No name, phone number or email is recorded.',
  'That they can stop at any time and ask to withdraw, and all their images and results are deleted.',
  'That taking part has no effect on any account or service.',
];

const OUTCOME: Record<EvalResult['outcome'], { title: string; body: string; cls: string }> = {
  BREACH: { title: 'BREACH: this attack was accepted as a live person', body: 'This is the number that matters most. Note the attack type, device and lighting, then check the flags below.', cls: 'border-red-500/40 bg-red-500/10 text-red-200' },
  defended: { title: 'Defended: the attack was stopped', body: 'The engine did not auto-accept it (review or fail).', cls: 'border-green-500/30 bg-green-500/10 text-green-200' },
  accepted: { title: 'Real person accepted', body: 'A genuine capture that passed automatically.', cls: 'border-green-500/30 bg-green-500/10 text-green-200' },
  stopped_for_review: { title: 'Real person sent to review', body: 'A false stop. Check the flags: was it light, camera quality, or the colour flash?', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-200' },
  rejected: { title: 'Real person rejected', body: 'A hard false reject. Look at which check failed.', cls: 'border-red-500/30 bg-red-500/10 text-red-200' },
};

function RateCell({ r }: { r: Rate }) {
  return (
    <div>
      <span className="font-mono text-white">{pct(r)}</span>
      <span className="text-slate-400"> ({r.k}/{r.n})</span>
      {r.n > 0 && <div className="text-sm text-slate-400">{ci(r)}</div>}
    </div>
  );
}

export default function StudyPage() {
  const { id } = useParams<{ id: string }>();
  const [study, setStudy] = useState<Study | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([evalCall<Study>(`/studies/${id}`), evalCall<{ metrics: Metrics; recent: Recent[] }>(`/studies/${id}/metrics`)]);
      setStudy(s); setMetrics(m.metrics); setRecent(m.recent);
    } catch (e) { setError((e as Error).message); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <div className="p-8"><p role="alert" className="text-base text-red-400">{error}</p><Link href="/dashboard/evaluation" className="text-indigo-400 underline mt-3 inline-block">Back to studies</Link></div>;
  if (!study || !metrics) return <div className="p-8 text-slate-400 text-base">Loading...</div>;

  return (
    <div className="p-8 max-w-6xl space-y-10">
      <div>
        <Link href="/dashboard/evaluation" className="inline-flex items-center gap-1.5 text-base text-slate-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> All studies</Link>
        <div className="flex items-start justify-between gap-4 mt-3">
          <div>
            <h1 className="text-2xl font-bold text-white">{study.name}</h1>
            <p className="text-base text-slate-400 mt-1">{study.purpose}</p>
            <p className="text-base text-slate-400 mt-1">Images kept {study.retention_days} days · consent wording {study.consent_version}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <ExportButton id={study.id} />
            <button onClick={async () => { await evalCall(`/studies/${study.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: study.status === 'open' ? 'closed' : 'open' }) }); void load(); }}
              className="text-sm px-4 py-2.5 rounded-lg border border-white/15 text-slate-200 hover:bg-white/5">{study.status === 'open' ? 'Close study' : 'Reopen study'}</button>
          </div>
        </div>
      </div>

      <Results m={metrics} />
      {study.status === 'open' ? <CapturePanel study={study} onDone={load} /> : <p className="text-base text-slate-400">This study is closed. Reopen it to add participants or captures.</p>}
      <Participants study={study} onChange={load} />

      <section>
        <h2 className="text-xl font-semibold text-white mb-3">Recent captures</h2>
        {recent.length === 0 ? <p className="text-base text-slate-400">None yet.</p> : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-base">
              <thead className="text-left text-slate-400 border-b border-white/10"><tr>{['When', 'Who', 'Truth', 'Lighting', 'Device', 'Engine verdict'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-white/[0.06]">
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-slate-300">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-white">{r.participant}</td>
                    <td className="px-4 py-3 text-slate-200">{r.label === 'attack' ? `attack: ${pretty(r.attack_type ?? '')}` : 'genuine'}</td>
                    <td className="px-4 py-3 text-slate-300">{pretty(r.lighting)}</td>
                    <td className="px-4 py-3 text-slate-300">{r.device ?? '-'}</td>
                    <td className="px-4 py-3"><span className={r.label === 'attack' && r.verdict === 'pass' ? 'text-red-300 font-semibold' : 'text-slate-200'}>{r.verdict}{r.label === 'attack' && r.verdict === 'pass' ? ' (BREACH)' : ''}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ExportButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const res = await fetch(`${API}/v1/developer/liveness-eval/studies/${id}/export.csv`, { headers: { Authorization: `Bearer ${getSession()?.token ?? ''}` } });
      if (!res.ok) throw new Error('Export failed');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a'); a.href = url; a.download = `liveness-eval-${id.slice(0, 8)}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch { /* surfaced by the browser as no download */ }
    setBusy(false);
  }
  return <button onClick={download} disabled={busy} className="inline-flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg border border-white/15 text-slate-200 hover:bg-white/5 disabled:opacity-50"><Download className="w-4 h-4" /> Export CSV</button>;
}

function Results({ m }: { m: Metrics }) {
  return (
    <section className="space-y-5">
      <h2 className="text-xl font-semibold text-white">Results</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-slate-900 p-5">
          <p className="text-base text-slate-300">Attacks let through</p>
          <p className="text-3xl font-bold text-white mt-1">{pct(m.apcer.overall)}</p>
          <p className="text-base text-slate-400 mt-1">{m.apcer.overall.k} of {m.apcer.overall.n} attacks auto-accepted</p>
          <p className="text-sm text-slate-400">{ci(m.apcer.overall)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900 p-5">
          <p className="text-base text-slate-300">Real people stopped (strict)</p>
          <p className="text-3xl font-bold text-white mt-1">{pct(m.bpcer.strict)}</p>
          <p className="text-base text-slate-400 mt-1">{m.bpcer.strict.k} of {m.bpcer.strict.n} sent to review or rejected</p>
          <p className="text-sm text-slate-400">{ci(m.bpcer.strict)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900 p-5">
          <p className="text-base text-slate-300">Real people rejected outright</p>
          <p className="text-3xl font-bold text-white mt-1">{pct(m.bpcer.hard)}</p>
          <p className="text-base text-slate-400 mt-1">{m.bpcer.hard.k} of {m.bpcer.hard.n}</p>
          <p className="text-sm text-slate-400">{ci(m.bpcer.hard)}</p>
        </div>
      </div>

      <div className={`rounded-xl border p-5 ${m.adequacy.ok ? 'border-green-500/30 bg-green-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
        <p className={`flex items-center gap-2 text-base font-semibold ${m.adequacy.ok ? 'text-green-200' : 'text-amber-200'}`}>
          {m.adequacy.ok ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          {m.adequacy.ok ? 'Sample sizes support these numbers' : 'Not enough data to quote these numbers yet'}
        </p>
        {m.adequacy.notes.length > 0 && <ul className="mt-2 list-disc pl-5 text-base text-slate-200 space-y-1">{m.adequacy.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Table title="By attack type (attacks accepted)" head={['Attack', 'Accepted']} rows={Object.entries(m.apcer.by_attack_type).map(([t, r]) => [pretty(t) + (t === m.apcer.worst_attack_type && (r.rate ?? 0) > 0 ? '  (worst)' : ''), <RateCell key={t} r={r} />])} empty="No attacks captured yet." />
        <Table title="By skin tone (real people stopped)" head={['Group', 'Stopped (strict)']} rows={Object.entries(m.by_skin_group).map(([g, v]) => [`${g} (${v.genuine} captures)`, <RateCell key={g} r={v.bpcer_strict} />])} empty="No genuine captures yet." />
        <Table title="By capture mode (is Lite as safe as Standard?)" head={['Mode', 'Real stopped', 'Attacks accepted']} rows={Object.entries(m.by_profile ?? {}).map(([k, v]) => [`${k} (${v.genuine} real, ${v.attacks} attacks)`, <RateCell key={k + 'a'} r={v.bpcer_strict} />, <RateCell key={k + 'b'} r={v.apcer} />])} empty="No captures yet." />
        <Table title="By lighting" head={['Lighting', 'Real stopped', 'Attacks accepted']} rows={Object.entries(m.by_lighting).map(([l, v]) => [pretty(l), <RateCell key={l + 'a'} r={v.bpcer_strict} />, <RateCell key={l + 'b'} r={v.apcer} />])} empty="No captures yet." />
        <div className="rounded-xl border border-white/10 bg-slate-900 p-5">
          <h3 className="text-base font-semibold text-white mb-2">Screen-light check outcomes</h3>
          <p className="text-base text-slate-300">Genuine: {Object.entries(m.flash.genuine).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}</p>
          <p className="text-base text-slate-300 mt-1">Attacks: {Object.entries(m.flash.attacks).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}</p>
        </div>
      </div>
    </section>
  );
}

function Table({ title, head, rows, empty }: { title: string; head: string[]; rows: React.ReactNode[][]; empty: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900 p-5">
      <h3 className="text-base font-semibold text-white mb-3">{title}</h3>
      {rows.length === 0 ? <p className="text-base text-slate-400">{empty}</p> : (
        <table className="w-full text-base">
          <thead className="text-left text-slate-400"><tr>{head.map((h) => <th key={h} className="pb-2 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-white/[0.06]">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="py-2.5 pr-3 text-slate-200 align-top">{c}</td>)}</tr>)}</tbody>
        </table>
      )}
    </div>
  );
}

function Participants({ study, onChange }: { study: Study; onChange: () => void }) {
  const [form, setForm] = useState({ age_band: '', gender: '', skin_tone: '', country: '' });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function add(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(''); setMsg('');
    try {
      const r = await evalCall<{ code: string }>(`/studies/${study.id}/participants`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consent_confirmed: consent,
          ...(form.age_band && { age_band: form.age_band }), ...(form.gender && { gender: form.gender }),
          ...(form.skin_tone && { skin_tone: Number(form.skin_tone) }), ...(form.country && { country: form.country.toUpperCase() }),
        }),
      });
      setMsg(`Added ${r.code}. Tell them this code, and nothing else about them is stored.`);
      setConsent(false); setForm({ age_band: '', gender: '', skin_tone: '', country: '' }); onChange();
    } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }
  async function withdraw(p: Participant) {
    if (!confirm(`Delete ALL images and results for ${p.code}? This cannot be undone.`)) return;
    try { await evalCall(`/participants/${p.id}/withdraw`, { method: 'POST' }); onChange(); } catch (x) { setErr((x as Error).message); }
  }
  const sel = 'w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/50';

  return (
    <section className="space-y-5">
      <h2 className="text-xl font-semibold text-white">Participants</h2>
      {study.status === 'open' && (
        <form onSubmit={add} className="rounded-xl border border-white/10 bg-slate-900 p-5 space-y-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <p className="text-base text-white font-medium mb-2">Before adding someone, tell them:</p>
            <ul className="list-disc pl-5 text-base text-slate-300 space-y-1">{CONSENT_POINTS.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div><label htmlFor="skin" className="block text-base text-slate-300 mb-1.5">Skin tone (1 to 10)</label>
              <select id="skin" className={sel} value={form.skin_tone} onChange={(e) => setForm({ ...form, skin_tone: e.target.value })}><option value="">Not recorded</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}{i < 3 ? ' (light)' : i < 6 ? ' (medium)' : ' (dark)'}</option>)}</select></div>
            <div><label htmlFor="age" className="block text-base text-slate-300 mb-1.5">Age</label>
              <select id="age" className={sel} value={form.age_band} onChange={(e) => setForm({ ...form, age_band: e.target.value })}><option value="">Not recorded</option>{['18-24', '25-34', '35-44', '45-54', '55+'].map((a) => <option key={a}>{a}</option>)}</select></div>
            <div><label htmlFor="gender" className="block text-base text-slate-300 mb-1.5">Gender</label>
              <select id="gender" className={sel} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="">Not recorded</option>{['female', 'male', 'other', 'undisclosed'].map((a) => <option key={a}>{a}</option>)}</select></div>
            <div><label htmlFor="country" className="block text-base text-slate-300 mb-1.5">Country (2 letters)</label>
              <input id="country" maxLength={2} className={sel} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="GH" /></div>
          </div>
          <label className="flex items-start gap-2 text-base text-slate-200 cursor-pointer">
            <input type="checkbox" className="mt-1.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I explained all of the above and this person freely agreed to take part.</span>
          </label>
          {err && <p role="alert" className="text-base text-red-400">{err}</p>}
          {msg && <p role="status" className="text-base text-green-300">{msg}</p>}
          <button disabled={!consent || busy} className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-ink font-semibold text-sm px-4 py-2.5 rounded-lg">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Add participant
          </button>
        </form>
      )}
      {study.participants.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-base">
            <thead className="text-left text-slate-400 border-b border-white/10"><tr>{['Code', 'Skin', 'Age', 'Gender', 'Country', 'Captures', ''].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-white/[0.06]">
              {study.participants.map((p) => (
                <tr key={p.id}>
                  <td className={`px-4 py-3 font-mono text-white ${p.withdrawn_at ? 'line-through decoration-slate-500' : ''}`}>{p.code}</td>
                  <td className="px-4 py-3 text-slate-300">{p.skin_tone ?? '-'}</td><td className="px-4 py-3 text-slate-300">{p.age_band ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-300">{p.gender ?? '-'}</td><td className="px-4 py-3 text-slate-300">{p.country ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-300">{p.withdrawn_at ? 'withdrawn' : p.captures}</td>
                  <td className="px-4 py-3 text-right">{!p.withdrawn_at && <button onClick={() => withdraw(p)} className="inline-flex items-center gap-1.5 text-sm text-red-300 hover:text-red-200"><Trash2 className="w-4 h-4" /> Withdraw</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CapturePanel({ study, onDone }: { study: Study; onDone: () => void }) {
  const active = study.participants.filter((p) => !p.withdrawn_at);
  const [participant, setParticipant] = useState('');
  const [label, setLabel] = useState<'genuine' | 'attack'>('genuine');
  const [attack, setAttack] = useState('screen_video');
  const [lighting, setLighting] = useState('indoor_bright');
  const [device, setDevice] = useState('');
  const [storeFrames, setStoreFrames] = useState(true);
  const [result, setResult] = useState<EvalResult | null>(null);
  const [run, setRun] = useState(0);
  const pid = participant || active[0]?.id || '';

  const demo = useMemo(() => ({
    start: () => evalCall<{ liveness_id: string; challenges: ChallengeType[]; attempt: number; max_attempts: number; capture: { max_frames: number; target_fps: number } }>('/runs/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ study_id: study.id, participant_id: pid, label, ...(label === 'attack' && { attack_type: attack }), lighting, ...(device && { device }), store_frames: storeFrames }),
    }),
    complete: (fd: FormData) => evalCall<EvalResult>('/runs/complete', { method: 'POST', body: fd }) as unknown as Promise<DemoResult>,
    onResult: (r: DemoResult) => { setResult(r as unknown as EvalResult); onDone(); },
  }), [study.id, pid, label, attack, lighting, device, storeFrames, onDone]);

  const sel = 'w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/50';
  const notice = `This capture stores your camera frames, encrypted, for ${study.retention_days} days so the accuracy of the system can be measured. You are known only by a code. You can stop now, and you can ask to withdraw later: everything of yours is then deleted.`;

  if (active.length === 0) return <section><h2 className="text-xl font-semibold text-white mb-2">Run a capture</h2><p className="text-base text-slate-400">Add a participant first.</p></section>;

  return (
    <section>
      <h2 className="text-xl font-semibold text-white mb-3">Run a capture</h2>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 h-fit">
          {result ? <p className="text-base text-slate-300">Capture saved. The outcome is on the right.</p> : <LiveFaceCapture key={run} btnColor="#C9960E" demo={demo} introText={notice} consentLabel="The participant agrees to their camera frames being stored for this study." />}
        </div>
        <div className="space-y-5">
          {result ? (
            <div className="space-y-4">
              <div className={`rounded-xl border p-5 ${OUTCOME[result.outcome].cls}`}>
                <p className="flex items-center gap-2 text-lg font-semibold">{result.outcome === 'BREACH' && <ShieldAlert className="w-5 h-5" />}{OUTCOME[result.outcome].title}</p>
                <p className="text-base mt-1">{OUTCOME[result.outcome].body}</p>
                <p className="text-base mt-2">Engine verdict: <strong>{result.verdict}</strong> (score {Math.round(result.score)}). Flags: {result.passive.flags.length ? result.passive.flags.map(pretty).join(', ') : 'none'}.</p>
                {result.flash && <p className="text-base mt-1">Screen-light: {result.flash.verdict}{result.flash.correlation !== null ? `, match ${result.flash.correlation}, chance ${result.flash.p_value}` : ''}.</p>}
              </div>
              <button onClick={() => { setResult(null); setRun((n) => n + 1); }} className="bg-indigo-500 hover:bg-indigo-400 text-ink font-semibold text-sm px-4 py-2.5 rounded-lg">Next capture</button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-base text-slate-300">Set what is true <em>before</em> the capture. This ground truth is what the error rates are computed against.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label htmlFor="cp" className="block text-base text-slate-300 mb-1.5">Participant</label>
                  <select id="cp" className={sel} value={pid} onChange={(e) => setParticipant(e.target.value)}>{active.map((p) => <option key={p.id} value={p.id}>{p.code}{p.skin_tone ? ` (skin ${p.skin_tone})` : ''}</option>)}</select></div>
                <div><label htmlFor="cl" className="block text-base text-slate-300 mb-1.5">What is being shown to the camera</label>
                  <select id="cl" className={sel} value={label} onChange={(e) => setLabel(e.target.value as 'genuine' | 'attack')}><option value="genuine">A real, live person (genuine)</option><option value="attack">An attack</option></select></div>
                {label === 'attack' && (
                  <div><label htmlFor="ca" className="block text-base text-slate-300 mb-1.5">Attack type</label>
                    <select id="ca" className={sel} value={attack} onChange={(e) => setAttack(e.target.value)}>{study.attack_types.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}</select></div>
                )}
                <div><label htmlFor="cli" className="block text-base text-slate-300 mb-1.5">Lighting</label>
                  <select id="cli" className={sel} value={lighting} onChange={(e) => setLighting(e.target.value)}>{study.lighting.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}</select></div>
                <div><label htmlFor="cd" className="block text-base text-slate-300 mb-1.5">Phone model</label>
                  <input id="cd" className={sel} maxLength={80} value={device} onChange={(e) => setDevice(e.target.value)} placeholder="Tecno Spark 10" /></div>
              </div>
              <label className="flex items-start gap-2 text-base text-slate-300 cursor-pointer">
                <input type="checkbox" className="mt-1.5" checked={storeFrames} onChange={(e) => setStoreFrames(e.target.checked)} />
                <span>Keep the frames (needed later to train a model). Untick to store only the measurements.</span>
              </label>
              <p className="text-base text-slate-400">For an attack, the person doing the capture holds the photo, screen or mask up to the scanning phone while the scan runs. Use different phones, lighting and tones: the variety is what makes the numbers credible.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
