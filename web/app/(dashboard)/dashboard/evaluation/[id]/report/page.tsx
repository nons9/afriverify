'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { evalCall, type MetricsResponse, type Rate } from '@/lib/eval-api';
import { PrintSheet } from '@/components/print-sheet';

const pretty = (s: string) => s.replace(/_/g, ' ');
const pct = (r: Rate) => (r.rate === null ? 'no data' : `${(r.rate * 100).toFixed(1)}%`);
const range = (r: Rate) => (r.low === null || r.high === null ? 'n/a' : `${(r.low * 100).toFixed(1)}% to ${(r.high * 100).toFixed(1)}%`);
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'n/a');

function Tbl({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <table className="w-full text-left border-collapse mt-2 text-[15px]">
      <thead><tr>{head.map((h) => <th key={h} className="border-b-2 border-slate-400 py-1.5 pr-3 font-semibold">{h}</th>)}</tr></thead>
      <tbody>{rows.length === 0 ? <tr><td className="py-2 text-slate-500" colSpan={head.length}>No data.</td></tr> : rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} className="border-b border-slate-200 py-1.5 pr-3">{c}</td>)}</tr>)}</tbody>
    </table>
  );
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { evalCall<MetricsResponse>(`/studies/${id}/metrics`).then(setD).catch((e: Error) => setError(e.message)); }, [id]);

  if (error) return <div className="p-8"><p role="alert" className="text-base text-red-400">{error}</p></div>;
  if (!d) return <div className="p-8 text-slate-400 text-base">Loading...</div>;
  const m = d.metrics;
  const draft = !m.adequacy.ok;

  const toolbar = <Link href={`/dashboard/evaluation/${d.study.id}`} className="inline-flex items-center gap-1.5 text-base text-slate-400 hover:text-white"><ArrowLeft className="w-4 h-4" aria-hidden /> Back to study</Link>;

  return (
    <PrintSheet toolbar={toolbar}>
      {draft && (
        <div className="mb-6 rounded-lg border-2 border-amber-500 bg-amber-50 p-4">
          <p className="font-bold text-amber-900">DRAFT. Do not quote these numbers.</p>
          <p className="text-amber-900 mt-1">The study has not yet reached the sample sizes needed for the figures to be reliable:</p>
          <ul className="list-disc pl-6 text-amber-900">{m.adequacy.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}
      <h1 className="text-2xl font-bold">Liveness accuracy report</h1>
      <p className="text-slate-600 mt-1">{d.study.name} · AfriVerify live face scan</p>

      <h2 className="mt-6 text-lg font-semibold">Summary</h2>
      <Tbl head={['Measure', 'Result', '95% range', 'Count']} rows={[
        ['Attacks accepted as a live person (APCER)', pct(m.apcer.overall), range(m.apcer.overall), `${m.apcer.overall.k} of ${m.apcer.overall.n}`],
        ['Real people stopped, strict (BPCER)', pct(m.bpcer.strict), range(m.bpcer.strict), `${m.bpcer.strict.k} of ${m.bpcer.strict.n}`],
        ['Real people rejected outright', pct(m.bpcer.hard), range(m.bpcer.hard), `${m.bpcer.hard.k} of ${m.bpcer.hard.n}`],
      ]} />

      <h2 className="mt-6 text-lg font-semibold">Methodology</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Measures follow the definitions of ISO/IEC 30107-3: APCER (attack accepted) and BPCER (genuine not accepted). This is our own study, not an accredited laboratory test.</li>
        <li>An attack counts as accepted only when the system gives a pass verdict with no human review.</li>
        <li>Intervals are 95% Wilson score intervals. Wide intervals mean too little data to be sure.</li>
        <li>Skin tone is grouped using the Monk scale (light 1-3, medium 4-6, dark 7-10), recorded with consent.</li>
        <li>Participants are known only by a code. Consent wording version {d.study.consent_version}. Images are retained {d.study.retention_days} days.</li>
      </ul>
      <p className="mt-2">Period: {day(d.period.from)} to {day(d.period.to)}. Participants: {d.participants_with_captures}. Distinct phone models: {d.distinct_devices}. Genuine captures: {m.totals.genuine}. Attack captures: {m.totals.attacks}.</p>

      <h2 className="mt-6 text-lg font-semibold">Attacks accepted by type</h2>
      <Tbl head={['Attack', 'Accepted', '95% range', 'Count']} rows={Object.entries(m.apcer.by_attack_type).map(([t, r]) => [pretty(t), pct(r), range(r), `${r.k} of ${r.n}`])} />

      <h2 className="mt-6 text-lg font-semibold">Real people stopped by skin tone</h2>
      <Tbl head={['Group', 'Stopped (strict)', '95% range', 'Count']} rows={Object.entries(m.by_skin_group).map(([g, v]) => [`${g} (${v.genuine} captures)`, pct(v.bpcer_strict), range(v.bpcer_strict), `${v.bpcer_strict.k} of ${v.bpcer_strict.n}`])} />

      <h2 className="mt-6 text-lg font-semibold">By lighting</h2>
      <Tbl head={['Lighting', 'Real stopped', 'Attacks accepted']} rows={Object.entries(m.by_lighting).map(([l, v]) => [pretty(l), `${pct(v.bpcer_strict)} (${v.bpcer_strict.k}/${v.bpcer_strict.n})`, `${pct(v.apcer)} (${v.apcer.k}/${v.apcer.n})`])} />

      <h2 className="mt-6 text-lg font-semibold">By capture mode</h2>
      <Tbl head={['Mode', 'Real stopped', 'Attacks accepted']} rows={Object.entries(m.by_profile ?? {}).map(([k, v]) => [pretty(k), `${pct(v.bpcer_strict)} (${v.bpcer_strict.k}/${v.bpcer_strict.n})`, `${pct(v.apcer)} (${v.apcer.k}/${v.apcer.n})`])} />

      <h2 className="mt-6 text-lg font-semibold">Limitations</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Results describe this sample, these attack methods and these devices. A determined attacker with other tools may do differently.</li>
        <li>Participants were recruited by the study team and may not represent all users.</li>
        <li>The study was run and analysed by the vendor. Independent testing (for example iBeta) has not been done.</li>
        <li>A result of 0% accepted means none were accepted in this sample, not that it cannot happen: read the upper end of the range.</li>
      </ul>
    </PrintSheet>
  );
}
