'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, RotateCcw, ScanFace, ShieldCheck, XCircle, AlertTriangle } from 'lucide-react';
import LiveFaceCapture, { DemoResult } from '@/components/live-face-capture';
import { getSession } from '@/lib/auth';
import { CHALLENGE_TEXT, REASON_LABEL, ChallengeType } from '@/lib/liveness-logic';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const token = getSession()?.token ?? '';
  const res = await fetch(`${API}/v1/developer/liveness-demo${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? body.error ?? res.statusText);
  return body as T;
}

// What each passive signal measures, in plain language.
const SIGNALS: { key: string; label: string; hint: string; fmt?: (v: number) => string }[] = [
  { key: 'sharpness', label: 'Sharpness', hint: 'Detail in the face. Very low means blur.' },
  { key: 'brightness', label: 'Brightness', hint: 'Average light on the face (0 to 255). Aim for 60 to 200.' },
  { key: 'contrast', label: 'Contrast', hint: 'Difference between light and dark areas.' },
  { key: 'glare', label: 'Glare', hint: 'Share of blown-out pixels. High can mean a screen.', fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { key: 'moire', label: 'Screen pattern', hint: 'Repeating pixel-grid pattern from filming a screen (0 to 1).' },
  { key: 'fringe', label: 'Screen fringes', hint: 'Wavy bands from filming a screen at normal camera resolution (0 to 1). High means a replay.' },
  { key: 'mean_motion', label: 'Natural motion', hint: 'Frame-to-frame movement. Near zero means a still or a loop.' },
  { key: 'duplicate_frame_ratio', label: 'Repeated frames', hint: 'Share of identical frames. High means frozen or looped video.', fmt: (v) => `${(v * 100).toFixed(0)}%` },
];

function Verdict({ r }: { r: DemoResult }) {
  const cfg = {
    pass: { Icon: CheckCircle2, cls: 'border-green-500/30 bg-green-500/10 text-green-300', title: 'Live person detected', body: 'Every prompt was followed in order and the passive checks look natural. In a real verification this would go on to the ID photo match.' },
    review: { Icon: AlertTriangle, cls: 'border-amber-500/30 bg-amber-500/10 text-amber-300', title: 'Borderline', body: 'The prompts were followed, but the image looks like it may be a screen or is poor quality. A real verification would never auto-approve this: it goes to a second provider or a human reviewer.' },
    fail: { Icon: XCircle, cls: 'border-red-500/30 bg-red-500/10 text-red-300', title: 'Not accepted', body: 'This scan would be rejected and the user asked to try again (up to 3 attempts).' },
  }[r.verdict];
  return (
    <div className={`rounded-xl border p-5 ${cfg.cls}`}>
      <div className="flex items-center gap-3">
        <cfg.Icon className="w-6 h-6 shrink-0" />
        <div>
          <p className="text-xl font-semibold">{cfg.title}</p>
          <p className="text-base opacity-90 mt-0.5">{cfg.body}</p>
        </div>
        <div className="ml-auto text-right shrink-0">
          <p className="text-3xl font-bold leading-none">{Math.round(r.score)}</p>
          <p className="text-sm opacity-90 mt-1">out of 100</p>
        </div>
      </div>
    </div>
  );
}

function Results({ r, onAgain }: { r: DemoResult; onAgain: () => void }) {
  const flags = useMemo(() => [...r.reasons, ...r.passive.flags].filter((x, i, a) => a.indexOf(x) === i), [r]);
  return (
    <div className="space-y-5">
      <Verdict r={r} />

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="text-base font-semibold text-white mb-3">Prompts detected</h3>
        <ol className="space-y-2">
          {r.challenges.map((c, i) => (
            <li key={i} className="flex items-center gap-3 text-base">
              {c.passed ? <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" /> : <XCircle className="w-5 h-5 text-red-400 shrink-0" />}
              <span className="text-slate-300">{i + 1}. {CHALLENGE_TEXT[c.type as ChallengeType] ?? c.type}</span>
              <span className={`ml-auto text-sm font-medium ${c.passed ? 'text-green-400' : 'text-red-400'}`}>{c.passed ? 'seen' : 'not seen'}</span>
            </li>
          ))}
        </ol>
      </div>

      {flags.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-base font-semibold text-white mb-3">What the engine flagged</h3>
          <div className="flex flex-wrap gap-2">
            {flags.map((f) => (
              <span key={f} className="text-sm text-slate-200 bg-white/5 border border-white/10 rounded px-2.5 py-1.5">{REASON_LABEL[f] ?? f.replace(/_/g, ' ')}</span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-base font-semibold text-white">Passive checks</h3>
          <span className="text-sm text-slate-300">score {Math.round(r.passive.score * 100)} / 100</span>
        </div>
        <dl className="divide-y divide-white/[0.06]">
          {SIGNALS.filter((s) => r.passive.signals[s.key] !== undefined).map((s) => (
            <div key={s.key} className="py-3 grid grid-cols-[1fr_auto] md:grid-cols-[9rem_5rem_1fr] gap-x-3 gap-y-1 text-base items-baseline">
              <dt className="text-slate-300">{s.label}</dt>
              <dd className="font-mono text-white">{s.fmt ? s.fmt(r.passive.signals[s.key]) : r.passive.signals[s.key]}</dd>
              <dd className="col-span-2 md:col-span-1 text-sm text-slate-400">{s.hint}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="text-sm text-slate-400 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
        Analysed {r.frame_stats.frames} frames in {r.processing_ms} ms. Nothing was stored: no images, no video, no session.
      </p>

      <button onClick={onAgain} className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-ink font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors">
        <RotateCcw className="w-4 h-4" /> Run again
      </button>
    </div>
  );
}

export default function LiveScanLabPage() {
  const [result, setResult] = useState<DemoResult | null>(null);
  const [run, setRun] = useState(0);

  const demo = useMemo(
    () => ({
      start: () =>
        call<{ liveness_id: string; challenges: ChallengeType[]; attempt: number; max_attempts: number; capture: { max_frames: number; target_fps: number } }>(
          '/start',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true }) }
        ),
      complete: (fd: FormData) => call<DemoResult>('/complete', { method: 'POST', body: fd }),
      onResult: (r: DemoResult) => setResult(r),
    }),
    []
  );
  const again = useCallback(() => { setResult(null); setRun((n) => n + 1); }, []);

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
          <ScanFace className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Live Scan Lab</h1>
          <p className="text-slate-400 text-sm mt-0.5">Try the live face scan your users will see, and see exactly why it passes or fails.</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_1fr] mt-8">
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 h-fit">
          {result ? (
            <p className="text-sm text-slate-300">Scan complete. Results are on the right.</p>
          ) : (
            <LiveFaceCapture key={run} btnColor="#C9960E" demo={demo} />
          )}
        </div>

        <div>
          {result ? (
            <Results r={result} onAgain={again} />
          ) : (
            <div className="space-y-5 text-sm text-slate-400 leading-relaxed">
              <div>
                <h2 className="text-white font-semibold mb-2">What happens</h2>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>You allow the camera and centre your face in the oval.</li>
                  <li>You follow three short prompts in a random order: one head turn, one blink, one smile.</li>
                  <li>The engine re-checks every frame on the server and runs anti-spoofing checks (screens, photos, loops).</li>
                </ol>
              </div>
              <div>
                <h2 className="text-white font-semibold mb-2">Try to break it</h2>
                <p>Hold up a photo, or play a video of yourself, and run a scan. The result shows which check caught it. This is the fastest way to build trust in the engine before you require it.</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <p className="text-slate-300">
                  To require the live scan in production, enable <strong>Require live face scan</strong> on a{' '}
                  <Link href="/dashboard/flows" className="text-indigo-400 hover:underline">verification flow</Link>, or pass{' '}
                  <code className="text-slate-200">require_liveness: true</code> when you create a session. See the{' '}
                  <Link href="/docs" className="text-indigo-400 hover:underline">docs</Link>.
                </p>
              </div>
              <p className="text-sm text-slate-400">Limited to 30 scans per hour per developer. Nothing is stored.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
