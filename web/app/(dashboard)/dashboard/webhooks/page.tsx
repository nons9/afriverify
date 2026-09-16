'use client';

import { useEffect, useState } from 'react';
import { Webhook, Copy, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface ApiKey {
  id: string;
  platform_name: string;
  api_key_prefix: string;
  environment: string;
  is_active: boolean;
  webhook_url: string | null;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded text-slate-500 hover:text-slate-300 transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function KeyWebhookCard({ apiKey }: { apiKey: ApiKey }) {
  const [url, setUrl] = useState(apiKey.webhook_url ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [secretError, setSecretError] = useState('');

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      await api.patch(`/v1/developer/keys/${apiKey.id}/webhook`, {
        webhook_url: url.trim() || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError((err as Error).message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate() {
    if (!confirm('Regenerate the signing secret? Your current secret will stop working immediately.')) return;
    setRegenerating(true);
    setSecretError('');
    setNewSecret(null);
    try {
      const res = await api.post<{ secret: string }>(`/v1/developer/keys/${apiKey.id}/webhook/secret`, {});
      setNewSecret(res.secret);
    } catch (err) {
      setSecretError((err as Error).message ?? 'Failed to regenerate');
    } finally {
      setRegenerating(false);
    }
  }

  const envBadge =
    apiKey.environment === 'production'
      ? 'bg-green-500/10 text-green-400'
      : 'bg-amber-500/10 text-amber-400';

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{apiKey.platform_name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${envBadge}`}>
              {apiKey.environment}
            </span>
          </div>
          <span className="text-xs text-slate-500 font-mono mt-0.5 block">
            {apiKey.api_key_prefix}••••
          </span>
        </div>
      </div>

      {/* Webhook URL */}
      <div className="mb-5">
        <label className="block text-xs font-medium text-slate-400 mb-2">Endpoint URL</label>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-platform.com/webhooks/afriverify"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
          </button>
        </div>
        {saveError && (
          <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {saveError}
          </p>
        )}
      </div>

      {/* Signing secret */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-2">Signing secret</label>
        {newSecret ? (
          <div className="flex items-center gap-2 bg-green-500/5 border border-green-500/20 rounded-lg px-4 py-3">
            <code className="flex-1 text-xs text-green-300 font-mono break-all">{newSecret}</code>
            <CopyButton text={newSecret} />
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-white/[0.02] border border-white/10 rounded-lg px-4 py-3">
            <code className="flex-1 text-xs text-slate-500 font-mono">
              ••••••••••••••••••••••••••••••••
            </code>
          </div>
        )}
        {newSecret && (
          <p className="text-xs text-amber-400 mt-2">
            Copy this secret now - it will not be shown again.
          </p>
        )}
        {secretError && (
          <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {secretError}
          </p>
        )}
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="mt-3 flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
          {regenerating ? 'Regenerating…' : 'Regenerate secret'}
        </button>
      </div>
    </div>
  );
}

export default function WebhooksPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ keys: ApiKey[] }>('/v1/developer/keys')
      .then((d) => setKeys(d.keys.filter((k) => k.is_active)))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Webhooks</h1>
        <p className="text-slate-400 text-sm mt-1">
          AfriVerify POSTs a signed event to your endpoint whenever a verification status changes.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 mb-8">
        <h3 className="text-sm font-semibold text-white mb-3">How it works</h3>
        <ul className="space-y-2 text-sm text-slate-400">
          <li className="flex items-start gap-2">
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            Each POST includes an <code className="text-indigo-300 text-xs">X-VerifyAfrica-Signature</code> header
            (HMAC-SHA512 of the body using your signing secret).
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            Verify the signature before trusting the payload.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            Deliveries are retried up to 3 times with exponential backoff (2 s, 4 s) on failure.
          </li>
        </ul>
        <div className="mt-4 bg-slate-900/50 rounded-lg p-4">
          <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-medium">Example payload</p>
          <pre className="text-xs text-slate-300 overflow-x-auto">{`{
  "event": "identity.verification_updated",
  "identity_id": "id_01hx...",
  "platform_user_id": "user_123",
  "verification_level": 2,
  "level_label": "biometric",
  "trust_score": 0.94,
  "timestamp": "2026-07-12T10:00:00.000Z"
}`}</pre>
        </div>
      </div>

      {/* Per-key config */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-16 bg-white/[0.03] border border-white/10 rounded-xl">
          <Webhook className="w-10 h-10 mx-auto mb-4 text-slate-700" />
          <h3 className="text-white font-medium mb-1">No active API keys</h3>
          <p className="text-slate-500 text-sm">Create an API key first to configure webhooks.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {keys.map((k) => (
            <KeyWebhookCard key={k.id} apiKey={k} />
          ))}
        </div>
      )}
    </div>
  );
}
