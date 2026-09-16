'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, LogOut, Link2Off, BadgeCheck, Key, RotateCcw, Trash2, Activity, ExternalLink } from 'lucide-react';
import { identityApi, clearIdentitySession } from '@/lib/identity-auth';

const i18n = {
  en: {
    signOut: 'Sign out',
    trustLevel: 'Trust level',
    trustScore: 'Trust score',
    nationality: 'Nationality',
    notSet: 'Not set',
    vitTitle: 'Verified Identity Token',
    vitSubtitle: 'Share your token with platforms to prove your verification — they can\'t see your personal details.',
    refreshAll: 'Refresh all',
    refreshing: 'Refreshing…',
    noTokens: 'No active tokens.',
    generateFirst: 'Generate your first token',
    viewToken: 'View',
    usedTimes: (n: number) => `Used ${n} time${n === 1 ? '' : 's'}`,
    lastBy: 'last by',
    expires: (d: string) => `Expires ${d}`,
    issued: 'issued',
    revoke: 'Revoke',
    revoking: 'Revoking…',
    connectedTitle: 'Connected platforms',
    connectedSubtitle: 'These apps trust your AfriVerify verification instead of asking you to verify again.',
    noConnections: 'No platforms connected yet.',
    connected: 'Connected',
    lastVerified: 'last verified',
    disconnect: 'Disconnect',
    disconnecting: 'Disconnecting…',
    disconnectedTitle: 'Disconnected',
    viewUsage: 'View full token usage history',
    confirmRevoke: (name: string) => `Disconnect ${name}? They will stop being able to treat you as AfriVerify-verified.`,
    confirmRevokeVit: 'Revoke this token? Any platform holding it will no longer be able to verify you with it.',
    confirmRefresh: 'Refresh your Verified Identity Token? All existing tokens will be revoked and a new one issued.',
    levelLabels: { 0: 'Not verified', 1: 'Phone verified', 2: 'Biometric verified' } as Record<number, string>,
  },
  fr: {
    signOut: 'Se déconnecter',
    trustLevel: 'Niveau de confiance',
    trustScore: 'Score de confiance',
    nationality: 'Nationalité',
    notSet: 'Non renseigné',
    vitTitle: 'Jeton d\'identité vérifiée',
    vitSubtitle: 'Partagez votre jeton avec les plateformes pour prouver votre vérification — elles ne voient jamais vos données personnelles.',
    refreshAll: 'Tout renouveler',
    refreshing: 'Renouvellement…',
    noTokens: 'Aucun jeton actif.',
    generateFirst: 'Générer votre premier jeton',
    viewToken: 'Voir',
    usedTimes: (n: number) => `Utilisé ${n} fois`,
    lastBy: 'dernière fois par',
    expires: (d: string) => `Expire le ${d}`,
    issued: 'émis',
    revoke: 'Révoquer',
    revoking: 'Révocation…',
    connectedTitle: 'Plateformes connectées',
    connectedSubtitle: 'Ces applications font confiance à votre vérification AfriVerify au lieu de vous demander de re-vérifier.',
    noConnections: 'Aucune plateforme connectée pour l\'instant.',
    connected: 'Connecté le',
    lastVerified: 'dernière vérif.',
    disconnect: 'Déconnecter',
    disconnecting: 'Déconnexion…',
    disconnectedTitle: 'Déconnectées',
    viewUsage: 'Voir l\'historique complet d\'utilisation des jetons',
    confirmRevoke: (name: string) => `Déconnecter ${name} ? Cette plateforme ne pourra plus vous considérer comme vérifié par AfriVerify.`,
    confirmRevokeVit: 'Révoquer ce jeton ? Toute plateforme qui le détient ne pourra plus vous vérifier avec.',
    confirmRefresh: 'Renouveler votre Jeton d\'identité vérifiée ? Tous les jetons existants seront révoqués et un nouveau sera émis.',
    levelLabels: { 0: 'Non vérifié', 1: 'Téléphone vérifié', 2: 'Biométrie vérifiée' } as Record<number, string>,
  },
} as const;

type Lang = keyof typeof i18n;

interface Me {
  phone: string;
  full_name: string;
  nationality: string;
  verification_level: number;
  trust_score: number;
  trust_level: string;
  verified_at: string | null;
}

interface Connection {
  platform_name: string;
  connected_at: string;
  last_verified: string | null;
  is_active: boolean;
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

function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  return `${phone.slice(0, 4)}${'•'.repeat(phone.length - 7)}${phone.slice(-3)}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}yr ago`;
}

export default function IdentityPortalPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [vits, setVits] = useState<VIT[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingVit, setRevokingVit] = useState<string | null>(null);
  const [refreshingVit, setRefreshingVit] = useState(false);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<Lang>('en');
  const t = i18n[lang];

  useEffect(() => {
    Promise.all([
      identityApi.get<Me>('/v1/identity-portal/me'),
      identityApi.get<{ connections: Connection[] }>('/v1/identity-portal/connections'),
      identityApi.get<{ vits: VIT[] }>('/v1/identity-portal/vit'),
    ])
      .then(([meData, connData, vitData]) => {
        setMe(meData);
        setConnections(connData.connections);
        setVits(vitData.vits);
      })
      .catch((err) => setError((err as Error).message || 'Could not load your identity'))
      .finally(() => setLoading(false));
  }, []);

  async function handleRevoke(platformName: string) {
    if (!confirm(t.confirmRevoke(platformName))) return;
    setRevoking(platformName);
    try {
      await identityApi.post(`/v1/identity-portal/connections/${encodeURIComponent(platformName)}/revoke`, {});
      setConnections((prev) => prev.map((c) => (c.platform_name === platformName ? { ...c, is_active: false } : c)));
    } catch (err) {
      setError((err as Error).message || 'Could not disconnect');
    } finally {
      setRevoking(null);
    }
  }

  async function handleRevokeVIT(vitId: string) {
    if (!confirm(t.confirmRevokeVit)) return;
    setRevokingVit(vitId);
    try {
      await identityApi.delete(`/v1/identity-portal/vit/${vitId}`);
      setVits((prev) => prev.filter((v) => v.id !== vitId));
    } catch (err) {
      setError((err as Error).message || 'Could not revoke token');
    } finally {
      setRevokingVit(null);
    }
  }

  async function handleRefreshVIT() {
    if (!confirm(t.confirmRefresh)) return;
    setRefreshingVit(true);
    try {
      const result = await identityApi.post<{ token: string; payload: Record<string, unknown> }>('/v1/identity-portal/vit/refresh', {});
      // Re-fetch the VIT list so we show the new token
      const vitData = await identityApi.get<{ vits: VIT[] }>('/v1/identity-portal/vit');
      setVits(vitData.vits);
      router.push(`/my-identity/vit?token=${encodeURIComponent(result.token)}`);
    } catch (err) {
      setError((err as Error).message || 'Could not refresh token');
    } finally {
      setRefreshingVit(false);
    }
  }

  function handleLogout() {
    clearIdentitySession();
    router.push('/my-identity/login');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const activeConnections = connections.filter((c) => c.is_active);
  const revokedConnections = connections.filter((c) => !c.is_active);

  return (
    <div className="min-h-screen bg-slate-950 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
            </div>
            <span className="font-bold text-white">AfriVerify</span>
          </div>
          <div className="flex items-center gap-3">
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
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> {t.signOut}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {me && (
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-xl font-bold text-white">{me.full_name || maskPhone(me.phone)}</h1>
                <p className="text-slate-500 text-sm mt-0.5">{maskPhone(me.phone)}</p>
              </div>
              {me.verification_level >= 1 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400 bg-green-500/10 px-3 py-1.5 rounded-full">
                  <BadgeCheck className="w-3.5 h-3.5" /> {t.levelLabels[me.verification_level] ?? 'Verified'}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/5">
              <div>
                <div className="text-xs text-slate-500 mb-1">{t.trustLevel}</div>
                <div className="text-sm text-white font-medium capitalize">{me.trust_level}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">{t.trustScore}</div>
                <div className="text-sm text-white font-medium tabular-nums">{me.trust_score}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">{t.nationality}</div>
                <div className="text-sm text-white font-medium">{me.nationality || t.notSet}</div>
              </div>
            </div>
          </div>
        )}

        {/* Verified Identity Token section */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-indigo-400" />
                {t.vitTitle}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{t.vitSubtitle}</p>
            </div>
            <button
              onClick={handleRefreshVIT}
              disabled={refreshingVit}
              className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors shrink-0 ml-4"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${refreshingVit ? 'animate-spin' : ''}`} />
              {refreshingVit ? t.refreshing : t.refreshAll}
            </button>
          </div>

          {vits.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-slate-500 text-sm mb-3">{t.noTokens}</p>
              <button
                onClick={handleRefreshVIT}
                disabled={refreshingVit}
                className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors"
              >
                {t.generateFirst}
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {vits.map((vit) => (
                <li key={vit.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded">
                          {vit.token_prefix}…
                        </code>
                        <a
                          href={`/my-identity/vit?id=${vit.id}`}
                          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-400 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" /> {t.viewToken}
                        </a>
                      </div>
                      <div className="text-xs text-slate-500 mt-1.5 space-y-0.5">
                        <div>
                          {t.usedTimes(vit.usage_count)}
                          {vit.last_used_by && <> &middot; {t.lastBy} <span className="text-slate-300">{vit.last_used_by}</span></>}
                          {vit.last_used_at && <> {timeAgo(vit.last_used_at)}</>}
                        </div>
                        <div>
                          {t.expires(new Date(vit.expires_at).toLocaleDateString())}
                          &middot; {t.issued} {timeAgo(vit.created_at)}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevokeVIT(vit.id)}
                      disabled={revokingVit === vit.id}
                      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 disabled:opacity-50 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {revokingVit === vit.id ? t.revoking : t.revoke}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-sm font-semibold text-white">{t.connectedTitle}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t.connectedSubtitle}</p>
          </div>
          {activeConnections.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-slate-500 text-sm">{t.noConnections}</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {activeConnections.map((c) => (
                <li key={c.platform_name} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <div className="text-sm font-medium text-white">{c.platform_name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {t.connected} {new Date(c.connected_at).toLocaleDateString()}
                      {c.last_verified && <> &middot; {t.lastVerified} {new Date(c.last_verified).toLocaleDateString()}</>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevoke(c.platform_name)}
                    disabled={revoking === c.platform_name}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 disabled:opacity-50 transition-colors"
                  >
                    <Link2Off className="w-3.5 h-3.5" />
                    {revoking === c.platform_name ? t.disconnecting : t.disconnect}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {revokedConnections.length > 0 && (
          <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5">
              <h2 className="text-sm font-semibold text-slate-400">{t.disconnectedTitle}</h2>
            </div>
            <ul className="divide-y divide-white/5">
              {revokedConnections.map((c) => (
                <li key={c.platform_name} className="px-6 py-3.5 text-sm text-slate-500">
                  {c.platform_name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Usage log link */}
        {vits.length > 0 && (
          <div className="mt-4 text-center">
            <a
              href="/my-identity/vit"
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              <Activity className="w-3.5 h-3.5" />
              {t.viewUsage}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
