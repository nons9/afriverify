'use client';

import { useEffect, useState, FormEvent } from 'react';
import { CheckCircle, Unlink, Store, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface ConnectionStatus {
  connected: false;
}
interface ConnectionActive {
  connected: true;
  ownerId: string;
  connectedAt: string;
  lastVerifiedAt: string | null;
}
type Status = ConnectionStatus | ConnectionActive;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function AfriAppPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api
      .get<Status>('/v1/developer/afriapp-key')
      .then(setStatus)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleConnect(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const result = await api.post<{ connected: boolean; ownerId: string }>(
        '/v1/developer/afriapp-key',
        { key }
      );
      setSuccess(`Connected - AfriApp owner ID: ${result.ownerId}`);
      setKey('');
      const updated = await api.get<Status>('/v1/developer/afriapp-key');
      setStatus(updated);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect your AfriApp key? You can reconnect at any time.')) return;
    setDisconnecting(true);
    try {
      await api.delete('/v1/developer/afriapp-key');
      setStatus({ connected: false });
      setSuccess('');
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Store className="w-4 h-4 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">AfriApp Store</h1>
        </div>
        <p className="text-slate-400 text-sm leading-relaxed max-w-prose">
          Connect an AfriApp-issued key to enable access purchased through{' '}
          <span className="text-slate-300">store.kliqa.africa</span>. Get your key from the AfriApp
          developer dashboard under <span className="text-slate-300">Team &amp; Access → API Keys</span>,
          selecting product <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-amber-400">AFRIVERIFY</code>.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* Current connection status */}
          {status?.connected ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-5 mb-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-semibold text-green-400">Connected</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-2">
                    AfriApp owner ID:{' '}
                    <code className="text-slate-300 font-mono">{status.ownerId}</code>
                  </p>
                  <p className="text-xs text-slate-500">
                    Connected {fmtDate(status.connectedAt)}
                    {status.lastVerifiedAt && (
                      <> · last verified {fmtDate(status.lastVerifiedAt)}</>
                    )}
                  </p>
                </div>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 disabled:opacity-40 transition-colors shrink-0"
                >
                  {disconnecting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Unlink className="w-3.5 h-3.5" />
                  )}
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400 mb-6">No AfriApp key connected.</p>
          )}

          {/* Feedback banners */}
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg mb-5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-4 py-3 rounded-lg mb-5">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {success}
            </div>
          )}

          {/* Connect / replace form */}
          <div>
            <h2 className="text-sm font-semibold text-white mb-1">
              {status?.connected ? 'Replace key' : 'Connect a key'}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Paste your <code className="text-amber-400">averify_live_…</code> key below. It will
              be verified against AfriApp immediately.
            </p>
            <form onSubmit={handleConnect} className="flex gap-3">
              <input
                required
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="averify_live_…"
                className="flex-1 bg-white/5 border border-white/10 text-white placeholder-slate-600 rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-w-0"
              />
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shrink-0"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {saving ? 'Verifying…' : status?.connected ? 'Replace' : 'Connect'}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
