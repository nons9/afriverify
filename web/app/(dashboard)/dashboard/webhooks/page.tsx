'use client';

import { useEffect, useState, useCallback } from 'react';
import { Webhook, Copy, RefreshCw, Check, AlertCircle, RotateCcw, ChevronDown, ChevronRight, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiKey {
  id: string;
  platform_name: string;
  api_key_prefix: string;
  environment: string;
  is_active: boolean;
  webhook_url: string | null;
}

interface WebhookDelivery {
  id: string;
  api_key_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  response_status: number | null;
  response_body: string | null;
  attempt_count: number;
  delivered_at: string | null;
  created_at: string;
  next_retry_at: string | null;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={handleCopy} className="p-1.5 rounded text-slate-500 hover:text-slate-300 transition-colors" title="Copy">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function StatusBadge({ status }: { status: number | null }) {
  if (status === null) return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-400">
      <Clock className="w-3 h-3" /> Pending
    </span>
  );
  if (status >= 200 && status < 300) return (
    <span className="inline-flex items-center gap-1 text-xs text-green-400">
      <CheckCircle2 className="w-3 h-3" /> {status}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-400">
      <XCircle className="w-3 h-3" /> {status}
    </span>
  );
}

// ─── Delivery row ─────────────────────────────────────────────────────────────

function DeliveryRow({ delivery, keyName, onReplay }: {
  delivery: WebhookDelivery;
  keyName: string;
  onReplay: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [replayResult, setReplayResult] = useState<{ status: number } | null>(null);

  async function handleReplay() {
    setReplaying(true);
    setReplayResult(null);
    try {
      const r = await api.post<{ status: number }>(`/v1/developer/webhooks/deliveries/${delivery.id}/replay`, {});
      setReplayResult(r);
      onReplay(delivery.id);
    } catch {
      setReplayResult({ status: 0 });
    } finally {
      setReplaying(false);
    }
  }

  const succeeded = delivery.response_status !== null && delivery.response_status >= 200 && delivery.response_status < 300;

  return (
    <div className="border border-white/5 rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs font-mono text-indigo-300">{delivery.event_type}</code>
            <span className="text-xs text-slate-600">·</span>
            <span className="text-xs text-slate-500">{keyName}</span>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <StatusBadge status={delivery.response_status} />
          {delivery.attempt_count > 1 && (
            <span className="text-xs text-slate-600">{delivery.attempt_count} attempts</span>
          )}
          <span className="text-xs text-slate-600">{timeAgo(delivery.created_at)}</span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/5 bg-slate-950/40 px-4 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-slate-500 mb-1">Delivery ID</div>
              <div className="font-mono text-slate-300 flex items-center gap-1">
                {delivery.id} <CopyButton text={delivery.id} />
              </div>
            </div>
            <div>
              <div className="text-slate-500 mb-1">Created</div>
              <div className="text-slate-300">{new Date(delivery.created_at).toLocaleString()}</div>
            </div>
            {delivery.delivered_at && (
              <div>
                <div className="text-slate-500 mb-1">Delivered at</div>
                <div className="text-slate-300">{new Date(delivery.delivered_at).toLocaleString()}</div>
              </div>
            )}
            {delivery.next_retry_at && !succeeded && (
              <div>
                <div className="text-slate-500 mb-1">Next retry</div>
                <div className="text-amber-400">{new Date(delivery.next_retry_at).toLocaleString()}</div>
              </div>
            )}
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-1.5">Payload</div>
            <pre className="text-xs text-slate-300 bg-slate-900/60 rounded-lg p-3 overflow-x-auto max-h-52">
              {JSON.stringify(delivery.payload, null, 2)}
            </pre>
          </div>

          {delivery.response_body && (
            <div>
              <div className="text-xs text-slate-500 mb-1.5">Response body</div>
              <pre className="text-xs text-slate-400 bg-slate-900/60 rounded-lg p-3 overflow-x-auto max-h-32">
                {delivery.response_body}
              </pre>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleReplay}
              disabled={replaying}
              className="inline-flex items-center gap-2 text-xs bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <RotateCcw className={`w-3 h-3 ${replaying ? 'animate-spin' : ''}`} />
              {replaying ? 'Replaying…' : 'Replay'}
            </button>
            {replayResult && (
              <span className={`text-xs ${replayResult.status >= 200 && replayResult.status < 300 ? 'text-green-400' : 'text-red-400'}`}>
                {replayResult.status > 0 ? `Replayed → ${replayResult.status}` : 'Replay failed'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Config card ──────────────────────────────────────────────────────────────

function KeyWebhookCard({ apiKey }: { apiKey: ApiKey }) {
  const [url, setUrl] = useState(apiKey.webhook_url ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [secretError, setSecretError] = useState('');

  async function handleSave() {
    setSaving(true); setSaveError('');
    try {
      await api.patch(`/v1/developer/keys/${apiKey.id}/webhook`, { webhook_url: url.trim() || null });
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
    setRegenerating(true); setSecretError(''); setNewSecret(null);
    try {
      const res = await api.post<{ secret: string }>(`/v1/developer/keys/${apiKey.id}/webhook/secret`, {});
      setNewSecret(res.secret);
    } catch (err) {
      setSecretError((err as Error).message ?? 'Failed to regenerate');
    } finally {
      setRegenerating(false);
    }
  }

  const envBadge = apiKey.environment === 'production'
    ? 'bg-green-500/10 text-green-400'
    : 'bg-amber-500/10 text-amber-400';

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{apiKey.platform_name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${envBadge}`}>{apiKey.environment}</span>
          </div>
          <span className="text-xs text-slate-500 font-mono mt-0.5 block">{apiKey.api_key_prefix}••••</span>
        </div>
      </div>

      <div className="mb-5">
        <label className="block text-xs font-medium text-slate-400 mb-2">Endpoint URL</label>
        <div className="flex gap-2">
          <input
            type="url" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-platform.com/webhooks/afriverify"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
          <button
            onClick={handleSave} disabled={saving}
            className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
          </button>
        </div>
        {saveError && <p className="text-xs text-red-400 mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {saveError}</p>}
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-2">Signing secret</label>
        {newSecret ? (
          <div className="flex items-center gap-2 bg-green-500/5 border border-green-500/20 rounded-lg px-4 py-3">
            <code className="flex-1 text-xs text-green-300 font-mono break-all">{newSecret}</code>
            <CopyButton text={newSecret} />
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-white/[0.02] border border-white/10 rounded-lg px-4 py-3">
            <code className="flex-1 text-xs text-slate-500 font-mono">••••••••••••••••••••••••••••••••</code>
          </div>
        )}
        {newSecret && <p className="text-xs text-amber-400 mt-2">Copy this secret now - it will not be shown again.</p>}
        {secretError && <p className="text-xs text-red-400 mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {secretError}</p>}
        <button
          onClick={handleRegenerate} disabled={regenerating}
          className="mt-3 flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
          {regenerating ? 'Regenerating…' : 'Regenerate secret'}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WebhooksPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed' | 'pending'>('all');

  const keyMap = Object.fromEntries(keys.map((k) => [k.id, k.platform_name]));

  const loadDeliveries = useCallback(() => {
    setDeliveriesLoading(true);
    api
      .get<{ deliveries: WebhookDelivery[] }>('/v1/developer/webhooks/deliveries')
      .then((d) => setDeliveries(d.deliveries ?? []))
      .catch(() => setDeliveries([]))
      .finally(() => setDeliveriesLoading(false));
  }, []);

  useEffect(() => {
    api
      .get<{ keys: ApiKey[] }>('/v1/developer/keys')
      .then((d) => setKeys(d.keys.filter((k) => k.is_active)))
      .catch(console.error)
      .finally(() => setKeysLoading(false));
    loadDeliveries();
  }, [loadDeliveries]);

  const filtered = deliveries.filter((d) => {
    if (eventFilter && !d.event_type.includes(eventFilter)) return false;
    if (statusFilter === 'success') return d.response_status !== null && d.response_status >= 200 && d.response_status < 300;
    if (statusFilter === 'failed') return d.response_status !== null && (d.response_status < 200 || d.response_status >= 300);
    if (statusFilter === 'pending') return d.response_status === null;
    return true;
  });

  const uniqueEvents = Array.from(new Set(deliveries.map((d) => d.event_type))).sort();

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Webhooks</h1>
        <p className="text-slate-400 text-sm mt-1">
          AfriVerify POSTs a signed event to your endpoint whenever a verification status changes.
        </p>
      </div>

      {/* Event log */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Event log</h2>
            <p className="text-slate-500 text-xs mt-0.5">Last 200 deliveries across all keys</p>
          </div>
          <button
            onClick={loadDeliveries}
            className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${deliveriesLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="bg-white/5 border border-white/10 text-slate-300 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500/50"
          >
            <option value="">All event types</option>
            {uniqueEvents.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <div className="flex gap-1">
            {(['all', 'success', 'failed', 'pending'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-xs px-3 py-2 rounded-lg border transition-colors capitalize ${
                  statusFilter === s
                    ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {deliveriesLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 bg-white/[0.02] border border-white/5 rounded-xl">
            <Webhook className="w-8 h-8 mx-auto mb-3 text-slate-700" />
            <p className="text-slate-500 text-sm">
              {deliveries.length === 0
                ? 'No deliveries yet. Webhook events will appear here once your endpoint receives its first call.'
                : 'No deliveries match the current filters.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((d) => (
              <DeliveryRow
                key={d.id}
                delivery={d}
                keyName={keyMap[d.api_key_id] ?? d.api_key_id}
                onReplay={loadDeliveries}
              />
            ))}
          </div>
        )}
      </div>

      {/* Config */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Endpoint configuration</h2>
        <p className="text-slate-500 text-sm mb-5">Configure a webhook URL and signing secret per API key.</p>

        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 mb-6">
          <h3 className="text-sm font-semibold text-white mb-3">How it works</h3>
          <ul className="space-y-2 text-sm text-slate-400">
            <li className="flex items-start gap-2">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
              Each POST includes an <code className="text-indigo-300 text-xs">X-VerifyAfrica-Signature</code> header (HMAC-SHA512 of the body using your signing secret).
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

        {keysLoading ? (
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
            {keys.map((k) => <KeyWebhookCard key={k.id} apiKey={k} />)}
          </div>
        )}
      </div>
    </div>
  );
}
