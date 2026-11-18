'use client';

/**
 * Live face scan: opens the camera, guides the user through a server-issued random
 * challenge sequence (turn / blink / smile), records frames (+ optional video) and
 * submits them to the AfriVerify liveness engine. Uploads are NOT accepted here:
 * every frame comes straight from the live camera stream.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { readableOn } from '@/lib/color';
import { Camera, CheckCircle2, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import {
  CHALLENGE_TEXT, ChallengeTracker, ChallengeType, FaceSample, friendlyReasons, median, positionHint,
} from '@/lib/liveness-logic';

type Phase = 'intro' | 'starting' | 'align' | 'baseline' | 'challenge' | 'uploading' | 'feedback' | 'camera_error';

interface StartResponse {
  liveness_id: string;
  challenges: ChallengeType[];
  attempt: number;
  max_attempts: number;
  capture: { max_frames: number; target_fps: number };
}
interface CompleteResponse {
  decision: 'approved' | 'rejected' | 'retry' | 'manual_review' | 'processing';
  liveness: { verdict: string; reasons: string[] };
  attempts_remaining: number;
  review_pending: boolean;
}

/** Result of a Live Scan Lab run (nothing is stored server-side). */
export interface DemoResult {
  demo: true;
  stored: false;
  verdict: 'pass' | 'review' | 'fail';
  score: number;
  challenges: { type: string; passed: boolean }[];
  reasons: string[];
  passive: { score: number; flags: string[]; signals: Record<string, number> };
  frame_stats: Record<string, number>;
  processing_ms: number;
}

/** Lets a page other than the hosted flow (the dashboard lab) supply its own server calls and receive the raw result. */
export interface DemoTransport {
  start: () => Promise<StartResponse>;
  complete: (form: FormData) => Promise<DemoResult>;
  onResult: (result: DemoResult) => void;
}

export interface LiveFaceCaptureProps {
  token?: string;
  api?: string;
  btnColor: string;
  required?: boolean;
  onSubmitted?: (r: { decision: CompleteResponse['decision']; reviewPending: boolean }) => void;
  onFailed?: (message: string) => void;
  onFallbackUpload?: () => void;
  /** Dashboard lab mode: no session, nothing stored, result handed to the page. */
  demo?: DemoTransport;
}

const TICK_MS = 125;              // ~8 fps
const BASELINE_MS = 1000;         // hold still, frontal frames for the server's baseline
const CHALLENGE_TIMEOUT_MS = 4000;
const TAIL_MS = 500;
const ALIGN_TICKS = 8;            // ~1s of good positioning before recording starts
const JPEG_QUALITY = 0.82;
const MODEL_URL = '/mediapipe/face_landmarker.task';
const WASM_URL = '/mediapipe/wasm';

type Landmarker = { detectForVideo: (v: HTMLVideoElement, ts: number) => any; close?: () => void };

async function post(api: string, path: string, init: RequestInit) {
  const res = await fetch(`${api}/v1/hosted${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.message ?? body.error ?? res.statusText), { status: res.status, code: body.error });
  return body;
}

function sampleFrom(result: any, brightness: number): FaceSample {
  const faces: any[] = result?.faceLandmarks ?? [];
  if (faces.length === 0) return { hasFace: false, faceCount: 0, noseRatio: 0.5, blink: 0, smile: 0, areaRatio: 0, brightness };
  const lm = faces[0];
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const p of lm) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const left = Math.min(lm[234].x, lm[454].x), right = Math.max(lm[234].x, lm[454].x);
  const noseRatio = (lm[1].x - left) / Math.max(right - left, 1e-6);
  const cats: { categoryName: string; score: number }[] = result?.faceBlendshapes?.[0]?.categories ?? [];
  const b = (n: string) => cats.find((c) => c.categoryName === n)?.score ?? 0;
  return {
    hasFace: true, faceCount: faces.length, noseRatio,
    blink: (b('eyeBlinkLeft') + b('eyeBlinkRight')) / 2,
    smile: (b('mouthSmileLeft') + b('mouthSmileRight')) / 2,
    areaRatio: (maxX - minX) * (maxY - minY), brightness,
  };
}

export default function LiveFaceCapture({ token = '', api = '', btnColor, required = false, onSubmitted, onFailed, onFallbackUpload, demo }: LiveFaceCaptureProps) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [consent, setConsent] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [hint, setHint] = useState('');
  const [challenges, setChallenges] = useState<ChallengeType[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [guidanceOn, setGuidanceOn] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<Landmarker | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const videoChunks = useRef<Blob[]>([]);
  const consentRef = useRef(false);

  const stopAll = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    try { if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop(); } catch { /* ignore */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => { stopAll(); landmarkerRef.current?.close?.(); }, [stopAll]);

  async function ensureLandmarker(): Promise<Landmarker | null> {
    if (landmarkerRef.current) return landmarkerRef.current;
    try {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      landmarkerRef.current = (await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: 'VIDEO', numFaces: 2, outputFaceBlendshapes: true,
      })) as unknown as Landmarker;
    } catch {
      landmarkerRef.current = null;
    }
    return landmarkerRef.current;
  }

  async function begin() {
    setError(''); setFeedback('');
    setPhase('starting');
    let start: StartResponse;
    try {
      start = demo ? await demo.start() : await post(api, '/face/liveness/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: token, consent: consentRef.current }),
      });
    } catch (e) {
      setError((e as Error).message); setPhase('intro'); return;
    }
    setChallenges(start.challenges); setDoneCount(0); setAttemptsLeft(start.max_attempts - start.attempt);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
    } catch {
      setPhase('camera_error'); return;
    }

    const lm = await ensureLandmarker();
    setGuidanceOn(!!lm);
    runCapture(start, lm);
  }

  function runCapture(start: StartResponse, lm: Landmarker | null) {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const W = 640, H = Math.round(640 * ((video.videoHeight || 480) / (video.videoWidth || 640)));
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const small = document.createElement('canvas');   // tiny canvas just for the brightness estimate
    small.width = 32; small.height = 24;
    const sctx = small.getContext('2d', { willReadFrequently: true })!;

    // best-effort screen-free recording of the camera stream (evidence)
    videoChunks.current = [];
    try {
      if (typeof MediaRecorder !== 'undefined' && streamRef.current) {
        const mime = ['video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
        if (mime) {
          const rec = new MediaRecorder(streamRef.current, { mimeType: mime, videoBitsPerSecond: 600_000 });
          rec.ondataavailable = (e) => { if (e.data.size) videoChunks.current.push(e.data); };
          recorderRef.current = rec;
        }
      }
    } catch { /* recording is optional */ }

    const frames: Blob[] = [];
    const stamps: number[] = [];   // frames[i] <-> stamps[i]; pushed together in toBlob's callback
    const windows: { start_ms: number; end_ms: number }[] = [];
    type LocalPhase = 'align' | 'baseline' | 'challenge' | 'finishing';
    let t0 = 0, localPhase = 'align' as LocalPhase;
    let alignOk = 0, baselineStart = 0, idx = 0, tracker: ChallengeTracker | null = null;
    let windowStart = 0, doneAt = 0;
    const baselineNose: number[] = [];
    let busy = false;
    const isFinishing = () => localPhase === 'finishing';   // a call, so TS doesn't narrow across closures
    setPhase('align'); setPrompt('Position your face inside the oval');

    const finish = async () => {
      localPhase = 'finishing';
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      try { if (recorderRef.current?.state === 'recording') recorderRef.current.stop(); } catch { /* ignore */ }
      setPhase('uploading'); setPrompt('Analysing your scan…');
      await submit(start, frames, stamps, windows);
    };

    const nextChallenge = (now: number) => {
      if (idx >= start.challenges.length) { void finish(); return; }
      const type = start.challenges[idx];
      tracker = new ChallengeTracker(type, baselineNose.length >= 3 ? median(baselineNose) : null);
      windowStart = now - t0; doneAt = 0;
      windows.push({ start_ms: windowStart, end_ms: windowStart });
      setPhase('challenge'); setPrompt(CHALLENGE_TEXT[type]); setDoneCount(idx);
    };

    tickRef.current = setInterval(() => {
      if (busy || isFinishing() || video.readyState < 2) return;
      busy = true;
      try {
        const now = performance.now();
        ctx.drawImage(video, 0, 0, W, H);   // raw, UNMIRRORED frame
        sctx.drawImage(video, 0, 0, 32, 24);
        const px = sctx.getImageData(0, 0, 32, 24).data;
        let sum = 0;
        for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        const brightness = sum / (px.length / 4);
        const sample: FaceSample = lm
          ? sampleFrom(lm.detectForVideo(video, now), brightness)
          : { hasFace: true, faceCount: 1, noseRatio: 0.5, blink: 0, smile: 0, areaRatio: 0.2, brightness: 128 }; // no local guidance: timed prompts only

        if (localPhase === 'align') {
          const h = positionHint(sample);
          setHint(h ?? '');
          alignOk = h ? 0 : alignOk + 1;
          if (alignOk >= ALIGN_TICKS) {
            localPhase = 'baseline'; t0 = now; baselineStart = now;
            setPhase('baseline'); setPrompt('Hold still and look at the camera'); setHint('');
            try { recorderRef.current?.start(1000); } catch { /* ignore */ }
          } else { return; }
        }

        // record this frame (alignment frames are not kept)
        const ts = now - t0;
        canvas.toBlob((blob) => { if (blob) { frames.push(blob); stamps.push(Math.round(ts)); } }, 'image/jpeg', JPEG_QUALITY);

        if (localPhase === 'baseline') {
          if (sample.hasFace) baselineNose.push(sample.noseRatio);
          if (now - baselineStart >= BASELINE_MS) { localPhase = 'challenge'; nextChallenge(now); }
        } else if (localPhase === 'challenge' && tracker) {
          const h = positionHint(sample);
          setHint(h && h !== 'Move back a little' ? h : '');
          if (lm && tracker.update(sample) && !doneAt) doneAt = now;
          const w = windows[windows.length - 1];
          w.end_ms = Math.round(now - t0);
          const timedOut = now - t0 - windowStart >= CHALLENGE_TIMEOUT_MS;
          if ((doneAt && now - doneAt >= TAIL_MS) || timedOut) { idx += 1; setDoneCount(idx); nextChallenge(now); }
        }
        if (frames.length >= start.capture.max_frames - 2 && !isFinishing()) void finish();
      } finally { busy = false; }
    }, TICK_MS);
  }

  async function submit(start: StartResponse, frames: Blob[], stamps: number[], windows: { start_ms: number; end_ms: number }[]) {
    // toBlob is async: wait until every captured frame has landed
    await new Promise((r) => setTimeout(r, 300));
    // toBlob callbacks may finish out of order: re-sort the (frame, timestamp) pairs by time
    const order = frames.map((_, i) => i).filter((i) => i < stamps.length).sort((a, b) => stamps[a] - stamps[b]);
    frames = order.map((i) => frames[i]);
    stamps = order.map((i) => stamps[i]);
    const n = frames.length;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      const fd = new FormData();
      fd.append('session_token', token);
      fd.append('liveness_id', start.liveness_id);
      fd.append('meta', JSON.stringify({ timestamps_ms: stamps.slice(0, n), windows }));
      frames.slice(0, n).forEach((b, i) => fd.append('frames', b, `f${i}.jpg`));
      if (demo) { demo.onResult(await demo.complete(fd)); return; }
      const res: CompleteResponse = await post(api, '/face/liveness/complete', { method: 'POST', body: fd });

      if (res.decision === 'retry') {
        setFeedback(friendlyReasons(res.liveness.reasons)); setAttemptsLeft(res.attempts_remaining); setPhase('feedback'); return;
      }
      if (res.decision === 'rejected') { onFailed?.(friendlyReasons(res.liveness.reasons)); return; }
      void uploadVideo(start.liveness_id);
      onSubmitted?.({ decision: res.decision, reviewPending: res.review_pending });
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === 'too_many_attempts') { onFailed?.('Too many attempts. Please start again later.'); return; }
      setFeedback(err.message || 'Something went wrong. Please try again.'); setPhase('feedback');
    }
  }

  async function uploadVideo(livenessId: string) {
    try {
      await new Promise((r) => setTimeout(r, 400));
      if (!videoChunks.current.length) return;
      const blob = new Blob(videoChunks.current, { type: 'video/webm' });
      if (blob.size > 14 * 1024 * 1024) return;
      const fd = new FormData();
      fd.append('session_token', token); fd.append('liveness_id', livenessId); fd.append('video', blob, 'capture.webm');
      await post(api, '/face/liveness/video', { method: 'POST', body: fd });
    } catch { /* evidence video is best-effort */ }
  }

  const capturing = ['starting', 'align', 'baseline', 'challenge', 'uploading'].includes(phase);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-white font-semibold text-lg">Live face scan</h2>
        <p className="text-slate-400 text-sm mt-1">We'll ask you to follow a few quick on-screen prompts to prove you're a real person.</p>
      </div>

      {phase === 'intro' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-slate-800/50 p-4 text-sm text-slate-300 space-y-2">
            <div className="flex items-center gap-2 text-white font-medium"><ShieldCheck className="w-4 h-4" /> Before we start</div>
            {demo ? (
              <p>This lab sends a short burst of camera frames to the liveness engine and shows you its verdict. <strong>Nothing is stored:</strong> no images, no video, no session. The frames are discarded as soon as the result is computed.</p>
            ) : (
              <p>We capture a short video of your face from your camera to check that you are live and to match you to your ID. Frames are encrypted, used only for this verification, and deleted after a short retention period.</p>
            )}
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={consent}
              onChange={(e) => { setConsent(e.target.checked); consentRef.current = e.target.checked; }} />
            <span>{demo ? 'I agree to my camera frames being analysed for this test.' : 'I agree to AfriVerify capturing and processing my face biometrics for identity verification.'}</span>
          </label>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <button type="button" disabled={!consent} onClick={begin}
            className="w-full py-3 rounded-xl text-white font-medium disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: btnColor, color: readableOn(btnColor) }}>
            <Camera className="w-4 h-4" /> Start camera
          </button>
          {!required && onFallbackUpload && (
            <button type="button" onClick={onFallbackUpload} className="w-full text-xs text-slate-500 hover:text-slate-300 underline">Upload a photo instead</button>
          )}
        </div>
      )}

      {/* camera stage stays mounted from 'starting' on so refs exist */}
      <div className={capturing ? 'space-y-3' : 'hidden'}>
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3]">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
          <svg viewBox="0 0 100 75" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
            <defs><mask id="oval"><rect width="100" height="75" fill="white" /><ellipse cx="50" cy="37" rx="19" ry="26" fill="black" /></mask></defs>
            <rect width="100" height="75" fill="rgba(2,6,23,0.55)" mask="url(#oval)" />
            <ellipse cx="50" cy="37" rx="19" ry="26" fill="none" stroke={phase === 'challenge' ? btnColor : 'rgba(255,255,255,0.6)'} strokeWidth="0.6" />
          </svg>
          {phase === 'uploading' && (
            <div className="absolute inset-0 bg-slate-950/70 flex items-center justify-center"><Loader2 className="w-8 h-8 text-white animate-spin" /></div>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />
        <div className="text-center min-h-[3.25rem]" aria-live="polite">
          <p className="text-white font-semibold">{phase === 'starting' ? 'Starting camera…' : prompt}</p>
          {hint && <p className="text-amber-300 text-sm mt-1">{hint}</p>}
          {!guidanceOn && phase !== 'starting' && <p className="text-slate-500 text-xs mt-1">Follow each prompt, then wait for the next.</p>}
        </div>
        {challenges.length > 0 && (
          <div className="flex justify-center gap-2" aria-label="progress">
            {challenges.map((c, i) => (
              <span key={c + i} className={`h-1.5 w-10 rounded-full ${i < doneCount ? '' : 'bg-white/15'}`} style={i < doneCount ? { background: btnColor } : undefined} />
            ))}
          </div>
        )}
      </div>

      {phase === 'feedback' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span role="alert">{feedback}</span>
          </div>
          {attemptsLeft !== null && <p className="text-xs text-slate-500">{attemptsLeft} attempt{attemptsLeft === 1 ? '' : 's'} left.</p>}
          <button type="button" onClick={begin} className="w-full py-3 rounded-xl text-white font-medium" style={{ background: btnColor, color: readableOn(btnColor) }}>Try again</button>
        </div>
      )}

      {phase === 'camera_error' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span role="alert">We couldn't access your camera. Allow camera access in your browser's site settings and try again.</span>
          </div>
          <button type="button" onClick={begin} className="w-full py-3 rounded-xl text-white font-medium" style={{ background: btnColor, color: readableOn(btnColor) }}>Try again</button>
          {!required && onFallbackUpload && (
            <button type="button" onClick={onFallbackUpload} className="w-full text-xs text-slate-500 hover:text-slate-300 underline">Upload a photo instead</button>
          )}
        </div>
      )}
    </div>
  );
}
