'use client';

import { useEffect, useState, FormEvent } from 'react';
import {
  Link2, Plus, Copy, ExternalLink, Trash2, CheckCircle,
  AlertCircle, Loader2, Users, Clock, RefreshCw, ChevronDown, ChevronUp
} from 'lucide-react';
import { api } from '@/lib/api';

interface Inquiry {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  status: 'active' | 'completed' | 'expired' | 'revoked';
  current_uses: number;
  max_uses: number | null;
  require_liveness: boolean;
  allowed_id_types: string[];
  expires_at: string | null;
  created_at: string;
  submission_count: number;
  completed_count: number;
}

interface ApiKey {
  id: string;
  platform_name: string;
  environment: string;
  is_active: boolean;
}

const statusColour = (s: string) => {
  if (s === 'active') return 'text-green-400 bg-green-500/10 border-green-500/20';
  if (s === 'revoked') return 'text-red-400 bg-red-500/10 border-red-500/20';
  return 'text-slate-400 bg-white/5 border-white/10';
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

export default function InquiriesPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const [form, setForm] = useState({
    api_key_id: '',
    label: '',
    description: '',
    require_liveness: false,
    max_uses: '',
    expires_at: '',
  });

  useEffect(() => {
    Promise.all([
      api.get<{ inquiries: Inquiry[] }>('/v1/inquiries'),
      api.get<{ keys: ApiKey[] }>('/v1/developer/keys'),
    ])
      .then(([inqRes, keyRes]) => {
        setInquiries(inqRes.inquiries);
        setApiKeys(keyRes.keys.filter((k) => k.is_active));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        api_key_id: form.api_key_id,
        label: form.label,
      };
      if (form.description) body.description = form.description;
      if (form.require_liveness) body.require_liveness = true;
      if (form.max_uses) body.max_uses = parseInt(form.max_uses);
      if (form.expires_at) body.expires_at = new Date(form.expires_at).toISOString();

      await api.post('/v1/inquiries', body);
      setSuccess('Inquiry link created.');
      setShowForm(false);
      setForm({ api_key_id: '', label: '', description: '', require_liveness: false, max_uses: '', expires_at: '' });
      const res = await api.get<{ inquiries: Inquiry[] }>('/v1/inquiries');
      setInquiries(res.inquiries);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this inquiry link? It will stop accepting new submissions.')) return;
    try {
      await api.delete(`/v1/inquiries/${id}`);
      setInquiries((prev) => prev.map((i) => i.id === id ? { ...i, status: 'revoked' } : i));
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }

  function copyLink(slug: string) {
    const url = `${window.location.origin}/verify/inquiry/${slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(slug);
      setTimeout(() => setCopied(''), 2000);
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Link2 className="w-4 h-4 text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Inquiries</h1>
          </div>
          <p className="text-slate-400 text-sm max-w-prose">
            Shareable, no-code verification links. Send a link to someone and AfriVerify guides them
            through identity verification - no API integration needed on their end.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Inquiry
        </button>
      </div>

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

      {showForm && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-white mb-4">Create inquiry link</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Label *</label>
              <input
                required
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Contractor onboarding - July 2025"
                className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Description (shown to respondents)</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="We need to verify your identity before processing your application."
                className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">API Key *</label>
                <select
                  required
                  value={form.api_key_id}
                  onChange={(e) => setForm((f) => ({ ...f, api_key_id: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  <option value="">Select a key…</option>
                  {apiKeys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.platform_name} ({k.environment})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Max uses (leave blank for unlimited)</label>
                <input
                  type="number"
                  min="1"
                  value={form.max_uses}
                  onChange={(e) => setForm((f) => ({ ...f, max_uses: e.target.value }))}
                  placeholder="∞"
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Expires at (optional)</label>
                <input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <div className="flex items-end pb-2.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.require_liveness}
                    onChange={(e) => setForm((f) => ({ ...f, require_liveness: e.target.checked }))}
                    className="w-4 h-4 rounded accent-indigo-500"
                  />
                  <span className="text-sm text-slate-300">Require liveness check</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {saving ? 'Creating…' : 'Create link'}
              </button>
            </div>
          </form>
        </div>
      )}

      {inquiries.length === 0 ? (
        <div className="text-center py-10">
          <Link2 className="w-6 h-6 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No inquiry links yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {inquiries.map((inq) => (
            <div key={inq.id}>
              <div className="py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 mb-1">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${statusColour(inq.status)}`}>
                        {inq.status}
                      </span>
                      <h3 className="text-sm font-semibold text-white truncate">{inq.label}</h3>
                    </div>
                    {inq.description && (
                      <p className="text-xs text-slate-500 mb-2 line-clamp-1">{inq.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {inq.submission_count} submitted · {inq.completed_count} passed
                        {inq.max_uses && ` · max ${inq.max_uses}`}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {fmtDate(inq.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {inq.status === 'active' && (
                      <>
                        <button
                          onClick={() => copyLink(inq.slug)}
                          title="Copy link"
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                          {copied === inq.slug ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                          {copied === inq.slug ? 'Copied' : 'Copy link'}
                        </button>
                        <a
                          href={`/verify/inquiry/${inq.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => handleRevoke(inq.id)}
                          className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/5 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setExpanded((e) => e === inq.id ? null : inq.id)}
                      className="text-slate-500 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      {expanded === inq.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {expanded === inq.id && (
                <div className="border-t border-white/[0.06] py-3 text-xs space-y-1.5 text-slate-500">
                  <div className="flex gap-8">
                    <span>Slug: <code className="text-slate-300">{inq.slug}</code></span>
                    {inq.require_liveness && <span className="text-amber-400">Liveness required</span>}
                    {inq.expires_at && <span>Expires {fmtDate(inq.expires_at)}</span>}
                  </div>
                  {inq.allowed_id_types.length > 0 && (
                    <div>Accepted IDs: {inq.allowed_id_types.join(', ')}</div>
                  )}
                  <div className="pt-1">
                    <code className="text-slate-400 select-all">
                      {typeof window !== 'undefined' ? window.location.origin : ''}/verify/inquiry/{inq.slug}
                    </code>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
