'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShieldCheck, Copy, Check, ArrowLeft, Clock, Activity } from 'lucide-react';
import { identityApi } from '@/lib/identity-auth';

const i18n = {
  en: {
    back: 'Back',
    vitTitle: 'Verified Identity Token',
    vitSubtitle: 'Show this to a platform to prove your AfriVerify verification.\nThey see only your trust score — never your name or ID.',
    copy: 'Copy',
    copied: 'Copied',
    expiresIn: (d: number) => `Expires in ${d} day${d === 1 ? '' : 's'}`,
    expired: 'Expired',
    usedTimes: (n: number) => `Used ${n} time${n === 1 ? '' : 's'}`,
    usageTitle: 'Usage history',
    noUsage: 'No verifications yet.',
    unknownPlatform: 'Unknown platform',
    freshTokenNotice: 'Your previous tokens have been revoked. Share this new token with platforms that need to verify you.',
  },
  fr: {
    back: 'Retour',
    vitTitle: 'Jeton d\'identité vérifiée',
    vitSubtitle: 'Présentez ce jeton à une plateforme pour prouver votre vérification AfriVerify.\nElle voit uniquement votre score de confiance — jamais votre nom ni votre pièce d\'identité.',
    copy: 'Copier',
    copied: 'Copié',
    expiresIn: (d: number) => `Expire dans ${d} jour${d === 1 ? '' : 's'}`,
    expired: 'Expiré',
    usedTimes: (n: number) => `Utilisé ${n} fois`,
    usageTitle: 'Historique d\'utilisation',
    noUsage: 'Aucune vérification pour l\'instant.',
    unknownPlatform: 'Plateforme inconnue',
    freshTokenNotice: 'Vos jetons précédents ont été révoqués. Partagez ce nouveau jeton avec les plateformes qui doivent vous vérifier.',
  },
} as const;

type Lang = keyof typeof i18n;

interface VITUsageEntry {
  platform_name: string | null;
  verified_at: string;
}

interface VIT {
  id: string;
  token_prefix: string;
  usage_count: number;
  last_used_at: string | null;
  last_used_by: string | null;
  expires_at: string;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) {
    const hours = Math.floor(diff / 3600000);
    if (hours === 0) {
      const mins = Math.floor(diff / 60000);
      return mins <= 1 ? 'just now' : `${mins}m ago`;
    }
    return `${hours}h ago`;
  }
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}yr ago`;
}

function VITPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // `token` is the raw JWT (set after a refresh redirect)
  // `id` is used to look up an existing VIT and its usage log
  const tokenParam = searchParams.get('token');
  const idParam = searchParams.get('id');

  const [vit, setVit] = useState<VIT | null>(null);
  const [usage, setUsage] = useState<VITUsageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [qrReady, setQrReady] = useState(false);
  const [lang, setLang] = useState<Lang>('en');
  const t = i18n[lang];

  useEffect(() => {
    async function load() {
      try {
        if (idParam) {
          // Load VIT metadata + usage log
          const [vitsData, usageData] = await Promise.all([
            identityApi.get<{ vits: VIT[] }>('/v1/identity-portal/vit'),
            identityApi.get<{ usage: VITUsageEntry[] }>(`/v1/identity-portal/vit/${idParam}/usage`),
          ]);
          const found = vitsData.vits.find((v) => v.id === idParam);
          if (!found) {
            setError('Token not found or already revoked.');
            return;
          }
          setVit(found);
          setUsage(usageData.usage);
        } else if (tokenParam) {
          // Fresh token from refresh — just show the QR, load VIT list to get metadata
          const vitsData = await identityApi.get<{ vits: VIT[] }>('/v1/identity-portal/vit');
          if (vitsData.vits.length > 0) {
            setVit(vitsData.vits[0]);
          }
        } else {
          // No params — redirect to list
          router.replace('/my-identity');
          return;
        }
      } catch (err) {
        setError((err as Error).message || 'Could not load token');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [idParam, tokenParam, router]);

  // Render QR code once the token is available
  useEffect(() => {
    const tokenValue = tokenParam || (vit ? `av_vit_${vit.id}` : null);
    if (!tokenValue || !canvasRef.current) return;

    // Dynamically load qrcode library
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    script.onload = () => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;
        // Clear any prior content
        canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);

        // Use QRCode library with canvas target
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new (window as any).QRCode(canvas.parentElement, {
          text: tokenValue,
          width: 220,
          height: 220,
          colorDark: '#6366f1',
          colorLight: '#0f172a',
          correctLevel: (window as any).QRCode.CorrectLevel.M,
        });
        setQrReady(true);
      } catch {
        // QR generation failed silently — user can still copy the token
      }
    };
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, [tokenParam, vit]);

  async function handleCopy() {
    const tokenValue = tokenParam || (vit ? `av_vit_${vit.id}` : '');
    if (!tokenValue) return;
    try {
      await navigator.clipboard.writeText(tokenValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const tokenDisplay = tokenParam
    ? `${tokenParam.slice(0, 20)}…`
    : vit
    ? `${vit.token_prefix}…`
    : '';

  const daysUntilExpiry = vit
    ? Math.ceil((new Date(vit.expires_at).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div className="min-h-screen bg-slate-950 p-4 sm:p-8">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push('/my-identity')}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {t.back}
          </button>
          <div className="flex-1" />
          <div className="inline-flex rounded-lg overflow-hidden border border-white/10 text-xs mr-2">
            {(['en', 'fr'] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  lang === l
                    ? 'bg-indigo-500 text-white'
                    : 'bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <span className="text-sm font-bold text-white">AfriVerify</span>
          </div>
        </div>

        {error ? (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        ) : (
          <>
            {/* Token card */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden mb-6">
              <div className="px-6 pt-6 pb-4 text-center border-b border-white/10">
                <h1 className="text-base font-semibold text-white mb-1">{t.vitTitle}</h1>
                <p className="text-xs text-slate-500">
                  {t.vitSubtitle.split('\n').map((line, i) => (
                    <span key={i}>{line}{i === 0 && <br />}</span>
                  ))}
                </p>
              </div>

              {/* QR Code */}
              <div className="flex justify-center py-6 bg-slate-900/50">
                {/* QRCode library appends a div+canvas inside this container */}
                <div
                  id="qr-container"
                  className="rounded-xl overflow-hidden"
                  style={{ width: 220, height: 220, background: '#0f172a' }}
                >
                  <canvas ref={canvasRef} width={220} height={220} />
                  {!qrReady && (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-indigo-500/40 border-t-indigo-500 rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              </div>

              {/* Token prefix + copy */}
              <div className="px-6 pb-6 pt-4">
                <div className="flex items-center gap-2 bg-slate-900 border border-white/10 rounded-lg px-3 py-2.5">
                  <code className="text-xs font-mono text-indigo-300 flex-1 truncate">{tokenDisplay}</code>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors shrink-0"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-400" />
                        <span className="text-green-400">{t.copied}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> {t.copy}
                      </>
                    )}
                  </button>
                </div>

                {vit && (
                  <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {daysUntilExpiry !== null && daysUntilExpiry > 0
                        ? t.expiresIn(daysUntilExpiry)
                        : t.expired}
                    </span>
                    <span className="tabular-nums">
                      {t.usedTimes(vit.usage_count)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Usage log (only shown when browsing by ?id=) */}
            {idParam && (
              <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-slate-400" />
                  <h2 className="text-sm font-semibold text-white">{t.usageTitle}</h2>
                </div>
                {usage.length === 0 ? (
                  <div className="px-6 py-8 text-center">
                    <p className="text-slate-500 text-sm">{t.noUsage}</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {usage.map((entry, i) => (
                      <li key={i} className="flex items-center justify-between px-6 py-3">
                        <span className="text-sm text-white">
                          {entry.platform_name || t.unknownPlatform}
                        </span>
                        <span className="text-xs text-slate-500 tabular-nums">
                          {timeAgo(entry.verified_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Fresh token notice */}
            {tokenParam && !idParam && (
              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-3 text-xs text-indigo-300">
                {t.freshTokenNotice}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function VITPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <VITPageContent />
    </Suspense>
  );
}
