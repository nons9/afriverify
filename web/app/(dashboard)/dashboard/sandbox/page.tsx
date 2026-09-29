'use client';

import { useEffect, useState, FormEvent } from 'react';
import { FlaskConical, RotateCcw, Copy, CheckCircle, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';

interface Credential {
  documentType: string;
  documentId: string;
  outcome: string;
  description: string;
}

interface Credentials {
  [country: string]: Credential[];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <button onClick={copy} className="ml-2 text-slate-500 hover:text-white transition-colors" title="Copy">
      {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function outcomePill(outcome: string) {
  const map: Record<string, string> = {
    pass: 'bg-green-500/10 text-green-400',
    fail: 'bg-red-500/10 text-red-400',
    aml_flagged: 'bg-amber-500/10 text-amber-400',
    blacklisted: 'bg-rose-500/10 text-rose-400',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[outcome] ?? 'bg-slate-500/10 text-slate-400'}`}>
      {outcome}
    </span>
  );
}

export default function SandboxPage() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [loadingCreds, setLoadingCreds] = useState(true);
  const [platformUserId, setPlatformUserId] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{ reset: boolean; reason?: string; identity_deleted?: boolean } | null>(null);
  const [resetError, setResetError] = useState('');

  useEffect(() => {
    api
      .get<{ credentials: Credentials }>('/v1/sandbox/credentials')
      .then((d) => setCredentials(d.credentials))
      .catch(console.error)
      .finally(() => setLoadingCreds(false));
  }, []);

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setResetError('');
    setResetResult(null);
    setResetting(true);
    try {
      const result = await api.post<{ reset: boolean; reason?: string; identity_deleted?: boolean }>(
        '/v1/sandbox/reset',
        { platform_user_id: platformUserId }
      );
      setResetResult(result);
    } catch (err) {
      setResetError((err as Error).message);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <FlaskConical className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Sandbox</h1>
          <p className="text-slate-400 text-sm mt-0.5">Test your integration with fake credentials - no real data ever leaves.</p>
        </div>
      </div>

      <div className="mt-2 mb-8 inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-400">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        Sandbox keys (prefix <code className="bg-amber-500/10 px-1 rounded">av_test_</code>) only. Real identity providers are never called.
      </div>

      {/* Test credentials */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-1">Test credentials</h2>
        <p className="text-slate-400 text-sm mb-5">
          Pass these document IDs in your <code className="bg-white/5 text-indigo-300 px-1 rounded">POST /v1/verify/initiate</code> flow.
          Each ID triggers a deterministic outcome - no KYC credits consumed.
        </p>

        {loadingCreds ? (
          <div className="flex justify-center h-32 items-center">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : credentials ? (
          <div className="space-y-8">
            {Object.entries(credentials).map(([country, creds]) => (
              <div key={country}>
                <div className="mb-3">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{country}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[540px]">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {['Document type', 'Test ID', 'Outcome', 'Description'].map((h) => (
                          <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {creds.map((c) => (
                        <tr key={c.documentId}>
                          <td className="px-5 py-3.5 text-xs text-slate-400">{c.documentType}</td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center">
                              <code className="text-xs text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded font-mono">
                                {c.documentId}
                              </code>
                              <CopyButton text={c.documentId} />
                            </div>
                          </td>
                          <td className="px-5 py-3.5">{outcomePill(c.outcome)}</td>
                          <td className="px-5 py-3.5 text-xs text-slate-400">{c.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Failed to load test credentials.</p>
        )}
      </section>

      {/* Reset tool */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-1">Reset sandbox state</h2>
        <p className="text-slate-400 text-sm mb-5">
          Clear a platform user&apos;s verification state so you can re-run the full flow from scratch.
          This deletes the <code className="bg-white/5 text-slate-300 px-1 rounded">platform_connections</code> row and,
          if no other platform uses the same identity, the <code className="bg-white/5 text-slate-300 px-1 rounded">verified_identities</code> row too.
        </p>

        <div className="max-w-md">
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Platform user ID
              </label>
              <input
                required
                value={platformUserId}
                onChange={(e) => setPlatformUserId(e.target.value)}
                placeholder="e.g. user_abc123"
                className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
              <p className="text-xs text-slate-500 mt-1">The ID your platform uses to identify this user.</p>
            </div>

            {resetError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-3 py-2 rounded-lg">
                {resetError}
              </div>
            )}

            {resetResult && (
              <div className={`border rounded-lg px-4 py-3 text-sm ${
                resetResult.reset
                  ? 'bg-green-500/10 border-green-500/20 text-green-400'
                  : 'bg-slate-500/10 border-slate-500/20 text-slate-400'
              }`}>
                {resetResult.reset ? (
                  <>
                    <div className="flex items-center gap-2 font-medium">
                      <CheckCircle className="w-4 h-4" /> State cleared
                    </div>
                    <div className="text-xs mt-1 opacity-80">
                      {resetResult.identity_deleted
                        ? 'Platform connection and identity record deleted.'
                        : 'Platform connection deleted. Identity retained (used by other platforms).'}
                    </div>
                  </>
                ) : (
                  <div>No sandbox state found for <strong>{platformUserId}</strong>.</div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={resetting || !platformUserId.trim()}
              className="flex items-center gap-2 bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-40 text-amber-400 border border-amber-500/30 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              <RotateCcw className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
              {resetting ? 'Resetting...' : 'Reset state'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
