'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { identityApi, setIdentitySession } from '@/lib/identity-auth';

const i18n = {
  en: {
    title: 'Your identity',
    subtitle: 'See which platforms trust your AfriVerify verification, and disconnect any you no longer use.',
    phoneLabel: 'Phone number',
    phoneHint: 'The phone number you verified with, including country code.',
    sendCode: 'Send code',
    sending: 'Sending code…',
    otpLabel: 'Enter the 6-digit code',
    continueBtn: 'Continue',
    verifying: 'Verifying…',
    differentNumber: 'Use a different number',
  },
  fr: {
    title: 'Votre identité',
    subtitle: 'Découvrez quelles plateformes font confiance à votre vérification AfriVerify, et déconnectez celles que vous n\'utilisez plus.',
    phoneLabel: 'Numéro de téléphone',
    phoneHint: 'Le numéro avec lequel vous avez effectué la vérification, avec l\'indicatif pays.',
    sendCode: 'Envoyer le code',
    sending: 'Envoi en cours…',
    otpLabel: 'Saisissez le code à 6 chiffres',
    continueBtn: 'Continuer',
    verifying: 'Vérification…',
    differentNumber: 'Utiliser un autre numéro',
  },
} as const;

type Lang = keyof typeof i18n;

export default function IdentityPortalLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<Lang>('en');
  const t = i18n[lang];

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await identityApi.post('/v1/identity-portal/login/otp/send', { phone });
      setStep('otp');
    } catch (err) {
      setError((err as Error).message || 'Could not send code');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmOtp(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token } = await identityApi.post<{ token: string }>('/v1/identity-portal/login/otp/confirm', {
        phone,
        otp
      });
      setIdentitySession(token);
      router.push('/my-identity');
    } catch (err) {
      setError((err as Error).message || 'Incorrect code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Language toggle */}
        <div className="flex justify-end mb-4">
          <div className="inline-flex rounded-lg overflow-hidden border border-white/10 text-xs">
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
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-500/10 mb-4">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">{t.title}</h1>
          <p className="text-slate-400 text-sm mt-1">{t.subtitle}</p>
        </div>

        {step === 'phone' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">{t.phoneLabel}</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+234..."
                className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-colors"
              />
              <p className="text-xs text-slate-500 mt-1.5">{t.phoneHint}</p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg text-sm transition-colors"
            >
              {loading ? t.sending : t.sendCode}
            </button>
          </form>
        ) : (
          <form onSubmit={handleConfirmOtp} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">{t.otpLabel}</label>
              <input
                type="text"
                inputMode="numeric"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-lg px-4 py-3 text-sm tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg text-sm transition-colors"
            >
              {loading ? t.verifying : t.continueBtn}
            </button>
            <button
              type="button"
              onClick={() => setStep('phone')}
              className="w-full text-slate-500 hover:text-slate-300 text-xs transition-colors"
            >
              {t.differentNumber}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
