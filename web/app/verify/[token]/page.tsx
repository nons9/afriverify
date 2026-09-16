'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, Shield, ChevronRight, Camera, Upload, Eye, EyeOff } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

interface Branding {
  company_name: string;
  logo_url: string | null;
  primary_color: string;
  button_color: string;
  otp_channel: 'sms' | 'email';
  phone_masked: string;
  current_step: string;
  lang: string;
  redirect_url: string | null;
}

type Step = 'loading' | 'otp_entry' | 'id_upload' | 'face_scan' | 'processing' | 'complete' | 'failed';

async function hostedFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}/v1/hosted${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string; error?: string };
    throw Object.assign(new Error(body.message ?? body.error ?? res.statusText), { status: res.status });
  }
  return res.json();
}

export default function HostedVerifyPage() {
  const { token } = useParams<{ token: string }>();
  const [branding, setBranding] = useState<Branding | null>(null);
  const [step, setStep] = useState<Step>('loading');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // OTP step
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState(3);

  // ID upload step
  const [idForm, setIdForm] = useState({ id_type: '', id_number: '', nationality: '', first_name: '', last_name: '', dob: '' });
  const [idFile, setIdFile] = useState<File | null>(null);
  const [idError, setIdError] = useState('');
  const idInputRef = useRef<HTMLInputElement>(null);

  // Face step
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [faceError, setFaceError] = useState('');
  const selfieInputRef = useRef<HTMLInputElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);

  // Poll interval
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const b: Branding = await hostedFetch(`/branding/${token}`);
        setBranding(b);
        // Map API step to UI step
        const uiStep = mapStep(b.current_step);
        if (uiStep === 'otp_entry') {
          await sendOtp(token);
        }
        setStep(uiStep);
      } catch (err) {
        setError((err as Error).message ?? 'Failed to load verification session.');
        setStep('failed');
      }
    })();
  }, [token]);

  function mapStep(s: string): Step {
    if (s === 'phone' || s === 'otp') return 'otp_entry';
    if (s === 'id_upload') return 'id_upload';
    if (s === 'face_scan') return 'face_scan';
    if (s === 'processing') return 'processing';
    if (s === 'complete') return 'complete';
    if (s === 'failed') return 'failed';
    return 'otp_entry';
  }

  async function sendOtp(sessionToken: string) {
    try {
      await hostedFetch('/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: sessionToken }),
      });
      setOtpSent(true);
    } catch (err) {
      setOtpError((err as Error).message);
    }
  }

  async function handleConfirmOtp() {
    setBusy(true);
    setOtpError('');
    try {
      const res = await hostedFetch('/otp/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: token, otp: otpCode }),
      }) as { next_step: string; attempts_remaining?: number };

      if (res.next_step === 'complete') {
        setStep('complete');
        scheduleRedirect();
      } else {
        setStep(mapStep(res.next_step));
      }
    } catch (err: unknown) {
      const e = err as Error & { status?: number };
      if (e.status === 400 && (err as { attempts_remaining?: number }).attempts_remaining !== undefined) {
        setAttemptsLeft((err as { attempts_remaining?: number }).attempts_remaining ?? 0);
      }
      setOtpError(e.message ?? 'Incorrect code. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleIdUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!idFile) { setIdError('Please attach your ID photo.'); return; }
    setBusy(true);
    setIdError('');
    try {
      const fd = new FormData();
      fd.append('session_token', token);
      fd.append('id_photo', idFile);
      Object.entries(idForm).forEach(([k, v]) => { if (v) fd.append(k, v); });

      await hostedFetch('/id/upload', { method: 'POST', body: fd });
      setStep('face_scan');
    } catch (err) {
      setIdError((err as Error).message ?? 'Upload failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleFaceSubmit() {
    if (!selfieFile) { setFaceError('Please take or upload a selfie.'); return; }
    setBusy(true);
    setFaceError('');
    try {
      const fd = new FormData();
      fd.append('session_token', token);
      fd.append('selfie', selfieFile);
      await hostedFetch('/face/submit', { method: 'POST', body: fd });
      setStep('processing');
      startPolling();
    } catch (err) {
      setFaceError((err as Error).message ?? 'Face submission failed.');
    } finally {
      setBusy(false);
    }
  }

  function startPolling() {
    pollRef.current = setInterval(async () => {
      try {
        const status = await hostedFetch(`/status/${token}`) as { status: string; redirect_url?: string };
        if (status.status === 'complete') {
          stopPolling();
          setStep('complete');
          scheduleRedirect(status.redirect_url);
        } else if (status.status === 'failed') {
          stopPolling();
          setStep('failed');
        }
      } catch { /* ignore transient errors */ }
    }, 3000);
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => () => stopPolling(), []);

  function scheduleRedirect(url?: string | null) {
    const dest = url ?? branding?.redirect_url;
    if (dest) {
      setTimeout(() => { window.location.href = dest; }, 3000);
    }
  }

  function handleSelfieChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setSelfieFile(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = (ev) => setSelfiePreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    }
  }

  const primary = branding?.primary_color ?? '#4F46E5';
  const btnColor = branding?.button_color ?? primary;

  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center px-4 py-10">
      {/* Brand header */}
      <div className="w-full max-w-md mb-8 flex flex-col items-center gap-3">
        {branding?.logo_url ? (
          <img
            src={branding.logo_url}
            alt={branding.company_name}
            className="h-10 max-w-[180px] object-contain"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: primary }}
          >
            <Shield className="w-5 h-5 text-white" />
          </div>
        )}
        {branding?.company_name && (
          <span className="text-white font-semibold text-lg">{branding.company_name}</span>
        )}
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl overflow-hidden">
        {/* Step progress */}
        {step !== 'complete' && step !== 'failed' && (
          <StepProgress current={step} primary={primary} />
        )}

        <div className="p-6">
          {step === 'otp_entry' && (
            <OtpStep
              branding={branding}
              otpCode={otpCode}
              otpError={otpError}
              attemptsLeft={attemptsLeft}
              busy={busy}
              onCodeChange={setOtpCode}
              onConfirm={handleConfirmOtp}
              onResend={() => { setOtpCode(''); setOtpError(''); sendOtp(token); }}
              btnColor={btnColor}
            />
          )}

          {step === 'id_upload' && (
            <IdUploadStep
              form={idForm}
              file={idFile}
              error={idError}
              busy={busy}
              fileRef={idInputRef}
              onFormChange={(k, v) => setIdForm(prev => ({ ...prev, [k]: v }))}
              onFileChange={(f) => setIdFile(f)}
              onSubmit={handleIdUpload}
              btnColor={btnColor}
            />
          )}

          {step === 'face_scan' && (
            <FaceStep
              selfiePreview={selfiePreview}
              showPreview={showPreview}
              error={faceError}
              busy={busy}
              fileRef={selfieInputRef}
              onFileChange={handleSelfieChange}
              onTogglePreview={() => setShowPreview(p => !p)}
              onSubmit={handleFaceSubmit}
              btnColor={btnColor}
            />
          )}

          {step === 'processing' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <Loader2 className="w-10 h-10 animate-spin" style={{ color: primary }} />
              <p className="text-white font-medium">Verifying your identity…</p>
              <p className="text-slate-400 text-sm">This usually takes under 30 seconds.</p>
            </div>
          )}

          {step === 'complete' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <CheckCircle2 className="w-14 h-14 text-emerald-400" />
              <p className="text-white text-lg font-semibold">Verification complete</p>
              <p className="text-slate-400 text-sm">
                Your identity has been verified.
                {branding?.redirect_url && ' You will be redirected shortly.'}
              </p>
            </div>
          )}

          {step === 'failed' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <XCircle className="w-14 h-14 text-red-400" />
              <p className="text-white text-lg font-semibold">Verification failed</p>
              <p className="text-slate-400 text-sm">
                {error || 'We could not verify your identity. Please contact support.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Powered by */}
      <p className="mt-6 text-xs text-slate-600">
        Secured by{' '}
        <span className="text-slate-500 font-medium">AfriVerify</span>
      </p>
    </div>
  );
}

function StepProgress({ current, primary }: { current: Step; primary: string }) {
  const steps: Array<{ key: Step; label: string }> = [
    { key: 'otp_entry', label: 'Phone' },
    { key: 'id_upload', label: 'ID' },
    { key: 'face_scan', label: 'Face' },
  ];
  const currentIdx = steps.findIndex(s => s.key === current);

  return (
    <div className="flex items-center justify-center gap-2 px-6 pt-5 pb-1">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                style={
                  done
                    ? { background: primary, color: '#fff' }
                    : active
                      ? { background: primary + '22', color: primary, border: `2px solid ${primary}` }
                      : { background: '#1e293b', color: '#64748b', border: '2px solid #334155' }
                }
              >
                {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span
                className="text-[10px] font-medium"
                style={{ color: active ? primary : done ? '#94a3b8' : '#475569' }}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="w-8 h-px mt-[-10px]"
                style={{ background: i < currentIdx ? primary : '#334155' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function OtpStep({
  branding, otpCode, otpError, attemptsLeft, busy,
  onCodeChange, onConfirm, onResend, btnColor,
}: {
  branding: Branding | null;
  otpCode: string;
  otpError: string;
  attemptsLeft: number;
  busy: boolean;
  onCodeChange: (v: string) => void;
  onConfirm: () => void;
  onResend: () => void;
  btnColor: string;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-white font-semibold text-lg">Verify your number</h2>
        <p className="text-slate-400 text-sm mt-1">
          {branding?.otp_channel === 'email'
            ? 'Enter the code sent to your email.'
            : `Enter the code sent to ${branding?.phone_masked ?? 'your phone'}.`}
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Verification code</label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={otpCode}
          onChange={e => onCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white text-center text-2xl tracking-[0.5em] font-mono placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
        />
        {otpError && (
          <p className="text-red-400 text-xs mt-1.5">{otpError} ({attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} left)</p>
        )}
      </div>

      <button
        onClick={onConfirm}
        disabled={otpCode.length !== 6 || busy}
        className="w-full py-2.5 rounded-lg font-medium text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
        style={{ background: btnColor }}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Confirm <ChevronRight className="w-4 h-4" /></>}
      </button>

      <button
        onClick={onResend}
        className="w-full text-sm text-slate-500 hover:text-slate-300 transition-colors"
      >
        Resend code
      </button>
    </div>
  );
}

function IdUploadStep({
  form, file, error, busy, fileRef,
  onFormChange, onFileChange, onSubmit, btnColor,
}: {
  form: Record<string, string>;
  file: File | null;
  error: string;
  busy: boolean;
  fileRef: { current: HTMLInputElement | null };
  onFormChange: (k: string, v: string) => void;
  onFileChange: (f: File) => void;
  onSubmit: (e: React.FormEvent) => void;
  btnColor: string;
}) {
  const ID_TYPES = [
    { value: 'national_id', label: 'National ID' },
    { value: 'passport', label: 'Passport' },
    { value: 'drivers_license', label: "Driver's License" },
    { value: 'voter_id', label: 'Voter ID' },
  ];

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h2 className="text-white font-semibold text-lg">Upload your ID</h2>
        <p className="text-slate-400 text-sm mt-1">Provide your government-issued photo ID.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-400 mb-1">ID Type</label>
          <select
            required
            value={form.id_type}
            onChange={e => onFormChange('id_type', e.target.value)}
            className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
          >
            <option value="">Select type</option>
            {ID_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {(['first_name', 'last_name'] as const).map(k => (
          <div key={k}>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              {k === 'first_name' ? 'First name' : 'Last name'}
            </label>
            <input
              required
              value={form[k]}
              onChange={e => onFormChange(k, e.target.value)}
              className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        ))}

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">ID Number</label>
          <input
            required
            value={form.id_number}
            onChange={e => onFormChange('id_number', e.target.value)}
            className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Nationality (2-char)</label>
          <input
            required
            maxLength={2}
            placeholder="NG"
            value={form.nationality}
            onChange={e => onFormChange('nationality', e.target.value.toUpperCase())}
            className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 uppercase"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-400 mb-1">Date of birth</label>
          <input
            type="date"
            value={form.dob}
            onChange={e => onFormChange('dob', e.target.value)}
            className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* File picker */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">ID Photo</label>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-white/10 rounded-lg p-4 flex flex-col items-center gap-2 text-slate-500 hover:border-white/20 hover:text-slate-400 transition-colors"
        >
          <Upload className="w-5 h-5" />
          <span className="text-sm">{file ? file.name : 'Tap to upload photo'}</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFileChange(f); }}
        />
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full py-2.5 rounded-lg font-medium text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
        style={{ background: btnColor }}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ChevronRight className="w-4 h-4" /></>}
      </button>
    </form>
  );
}

function FaceStep({
  selfiePreview, showPreview, error, busy, fileRef,
  onFileChange, onTogglePreview, onSubmit, btnColor,
}: {
  selfiePreview: string | null;
  showPreview: boolean;
  error: string;
  busy: boolean;
  fileRef: { current: HTMLInputElement | null };
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTogglePreview: () => void;
  onSubmit: () => void;
  btnColor: string;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-white font-semibold text-lg">Take a selfie</h2>
        <p className="text-slate-400 text-sm mt-1">
          Look directly at the camera in good lighting. No glasses or hats.
        </p>
      </div>

      {selfiePreview ? (
        <div className="relative rounded-xl overflow-hidden">
          <img src={selfiePreview} alt="selfie preview" className="w-full h-52 object-cover" />
          <button
            type="button"
            onClick={onTogglePreview}
            className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white"
          >
            {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute bottom-2 right-2 px-3 py-1.5 bg-black/50 rounded-full text-white text-xs flex items-center gap-1"
          >
            <Camera className="w-3 h-3" /> Retake
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full h-44 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-500 hover:border-white/20 hover:text-slate-400 transition-colors"
        >
          <Camera className="w-8 h-8" />
          <span className="text-sm">Tap to open camera</span>
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={onFileChange}
      />

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        onClick={onSubmit}
        disabled={!selfiePreview || busy}
        className="w-full py-2.5 rounded-lg font-medium text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
        style={{ background: btnColor }}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Submit <ChevronRight className="w-4 h-4" /></>}
      </button>
    </div>
  );
}
