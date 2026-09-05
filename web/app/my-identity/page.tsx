'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, LogOut, Link2Off, BadgeCheck } from 'lucide-react';
import { identityApi, clearIdentitySession } from '@/lib/identity-auth';

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

const LEVEL_LABELS: Record<number, string> = {
  0: 'Not verified',
  1: 'Phone verified',
  2: 'Biometric verified'
};

function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  return `${phone.slice(0, 4)}${'•'.repeat(phone.length - 7)}${phone.slice(-3)}`;
}

export default function IdentityPortalPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([identityApi.get<Me>('/v1/identity-portal/me'), identityApi.get<{ connections: Connection[] }>('/v1/identity-portal/connections')])
      .then(([meData, connData]) => {
        setMe(meData);
        setConnections(connData.connections);
      })
      .catch((err) => setError((err as Error).message || 'Could not load your identity'))
      .finally(() => setLoading(false));
  }, []);

  async function handleRevoke(platformName: string) {
    if (!confirm(`Disconnect ${platformName}? They will stop being able to treat you as AfriVerify-verified.`)) return;
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
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
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
                  <BadgeCheck className="w-3.5 h-3.5" /> {LEVEL_LABELS[me.verification_level] ?? 'Verified'}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/5">
              <div>
                <div className="text-xs text-slate-500 mb-1">Trust level</div>
                <div className="text-sm text-white font-medium capitalize">{me.trust_level}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Trust score</div>
                <div className="text-sm text-white font-medium tabular-nums">{me.trust_score}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Nationality</div>
                <div className="text-sm text-white font-medium">{me.nationality || 'Not set'}</div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-sm font-semibold text-white">Connected platforms</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              These apps trust your AfriVerify verification instead of asking you to verify again.
            </p>
          </div>
          {activeConnections.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-slate-500 text-sm">No platforms connected yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {activeConnections.map((c) => (
                <li key={c.platform_name} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <div className="text-sm font-medium text-white">{c.platform_name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Connected {new Date(c.connected_at).toLocaleDateString()}
                      {c.last_verified && <> &middot; last verified {new Date(c.last_verified).toLocaleDateString()}</>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevoke(c.platform_name)}
                    disabled={revoking === c.platform_name}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 disabled:opacity-50 transition-colors"
                  >
                    <Link2Off className="w-3.5 h-3.5" />
                    {revoking === c.platform_name ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {revokedConnections.length > 0 && (
          <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5">
              <h2 className="text-sm font-semibold text-slate-400">Disconnected</h2>
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
      </div>
    </div>
  );
}
