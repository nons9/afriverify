'use client';

import { useState, FormEvent } from 'react';
import {
  ShieldCheck, Download, AlertCircle, CheckCircle, Loader2,
  FolderOpen, Plus, Clock, ChevronDown
} from 'lucide-react';
import { api } from '@/lib/api';

interface ExportSummary {
  total_events: number;
  unique_identities: number;
  active_api_keys: number;
  exported_rows: number;
}

interface ReviewCase {
  id: string;
  case_ref: string;
  reason: string;
  status: 'open' | 'under_review' | 'approved' | 'rejected' | 'escalated';
  priority: 'low' | 'medium' | 'high' | 'critical';
  identity_id: string | null;
  assignee: string | null;
  created_at: string;
}

const priorityColour = (p: string) => {
  if (p === 'critical') return 'text-red-400 bg-red-500/10 border-red-500/20';
  if (p === 'high')     return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
  if (p === 'medium')   return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  return 'text-slate-400 bg-white/5 border-white/10';
};

const statusColour = (s: string) => {
  if (s === 'approved') return 'text-green-400';
  if (s === 'rejected') return 'text-red-400';
  if (s === 'under_review') return 'text-indigo-400';
  if (s === 'escalated') return 'text-orange-400';
  return 'text-slate-400';
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

export default function CompliancePage() {
  const [exportLoading, setExportLoading] = useState(false);
  const [exportSummary, setExportSummary] = useState<ExportSummary | null>(null);
  const [exportError, setExportError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [format, setFormat] = useState<'json' | 'csv'>('json');

  const [cases, setCases] = useState<ReviewCase[] | null>(null);
  const [casesLoading, setCasesLoading] = useState(false);
  const [showCaseForm, setShowCaseForm] = useState(false);
  const [caseReason, setCaseReason] = useState('');
  const [casePriority, setCasePriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [caseIdentityId, setCaseIdentityId] = useState('');
  const [caseSaving, setCaseSaving] = useState(false);
  const [caseError, setCaseError] = useState('');
  const [caseSuccess, setCaseSuccess] = useState('');

  async function handleExport(e: FormEvent) {
    e.preventDefault();
    setExportError('');
    setExportLoading(true);
    try {
      const params = new URLSearchParams({ format });
      if (startDate) params.set('start_date', startDate);
      if (endDate)   params.set('end_date', endDate);

      if (format === 'csv') {
        // Fetch raw text for CSV download
        const token = localStorage.getItem('ov_token');
        const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
        const res = await fetch(`${base}/v1/developer/compliance/export?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `afriverify-audit-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const data = await api.get<{ summary: ExportSummary }>(`/v1/developer/compliance/export?${params}`);
        setExportSummary(data.summary);
        // Download JSON
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `afriverify-audit-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err: unknown) {
      setExportError((err as Error).message);
    } finally {
      setExportLoading(false);
    }
  }

  async function loadCases() {
    setCasesLoading(true);
    try {
      const res = await api.get<{ cases: ReviewCase[] }>('/v1/developer/compliance/cases');
      setCases(res.cases);
    } catch (err: unknown) {
      setCaseError((err as Error).message);
    } finally {
      setCasesLoading(false);
    }
  }

  async function handleCreateCase(e: FormEvent) {
    e.preventDefault();
    setCaseError('');
    setCaseSaving(true);
    try {
      const body: Record<string, unknown> = { reason: caseReason, priority: casePriority };
      if (caseIdentityId) body.identity_id = caseIdentityId;
      await api.post('/v1/developer/compliance/cases', body);
      setCaseSuccess('Case opened.');
      setShowCaseForm(false);
      setCaseReason('');
      setCaseIdentityId('');
      await loadCases();
    } catch (err: unknown) {
      setCaseError((err as Error).message);
    } finally {
      setCaseSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-teal-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Compliance & Audit</h1>
        </div>
        <p className="text-slate-400 text-sm max-w-prose">
          Export a full audit trail of all verification events for NDPR / GDPR data-subject requests,
          and manage your human-review case queue.
        </p>
      </div>

      {/* Audit Export */}
      <section>
        <h2 className="text-sm font-semibold text-white mb-4">Audit trail export</h2>
        <form onSubmit={handleExport} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">From (optional)</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">To (optional)</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="text-xs text-slate-400">Format:</label>
              {(['json', 'csv'] as const).map((f) => (
                <label key={f} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="format"
                    value={f}
                    checked={format === f}
                    onChange={() => setFormat(f)}
                    className="accent-indigo-500"
                  />
                  <span className="text-sm text-slate-300 uppercase">{f}</span>
                </label>
              ))}
            </div>
            {exportError && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {exportError}
              </div>
            )}
            {exportSummary && (
              <div className="grid grid-cols-4 gap-3 text-center">
                {[
                  { label: 'Total events', val: exportSummary.total_events },
                  { label: 'Unique identities', val: exportSummary.unique_identities },
                  { label: 'Active keys', val: exportSummary.active_api_keys },
                  { label: 'Rows exported', val: exportSummary.exported_rows },
                ].map(({ label, val }) => (
                  <div key={label}>
                    <div className="text-lg font-semibold text-white tabular-nums">{val.toLocaleString()}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={exportLoading}
                className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {exportLoading ? 'Preparing…' : `Download ${format.toUpperCase()}`}
              </button>
            </div>
          </form>
      </section>

      {/* Case Management */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Review cases</h2>
          <div className="flex gap-2">
            {cases === null && (
              <button
                onClick={loadCases}
                disabled={casesLoading}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors"
              >
                {casesLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />}
                Load cases
              </button>
            )}
            <button
              onClick={() => { setShowCaseForm((v) => !v); if (cases === null) loadCases(); }}
              className="flex items-center gap-1.5 text-xs bg-indigo-500 hover:bg-indigo-400 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Open case
            </button>
          </div>
        </div>

        {caseError && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {caseError}
          </div>
        )}
        {caseSuccess && (
          <div className="flex items-start gap-2 bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-4 py-3 rounded-lg mb-4">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {caseSuccess}
          </div>
        )}

        {showCaseForm && (
          <div className="mb-4">
            <form onSubmit={handleCreateCase} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Reason *</label>
                <textarea
                  required
                  value={caseReason}
                  onChange={(e) => setCaseReason(e.target.value)}
                  rows={3}
                  placeholder="Describe what needs manual review…"
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Priority</label>
                  <select
                    value={casePriority}
                    onChange={(e) => setCasePriority(e.target.value as typeof casePriority)}
                    className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Identity ID (optional)</label>
                  <input
                    value={caseIdentityId}
                    onChange={(e) => setCaseIdentityId(e.target.value)}
                    placeholder="UUID"
                    className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-600 rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowCaseForm(false)} className="text-sm text-slate-400 hover:text-white px-4 py-2 transition-colors">Cancel</button>
                <button
                  type="submit"
                  disabled={caseSaving}
                  className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {caseSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {caseSaving ? 'Opening…' : 'Open case'}
                </button>
              </div>
            </form>
          </div>
        )}

        {casesLoading && (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
          </div>
        )}

        {cases !== null && !casesLoading && cases.length === 0 && (
          <div className="text-center py-8">
            <FolderOpen className="w-5 h-5 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No cases yet.</p>
          </div>
        )}

        {cases !== null && cases.length > 0 && (
          <div className="divide-y divide-white/[0.06]">
            {cases.map((c) => (
              <div key={c.id} className="py-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-xs text-slate-500 font-mono">{c.case_ref}</code>
                    <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full border ${priorityColour(c.priority)}`}>
                      {c.priority}
                    </span>
                    <span className={`text-xs font-medium ${statusColour(c.status)}`}>
                      {c.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-white line-clamp-2">{c.reason}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDate(c.created_at)}</span>
                    {c.assignee && <span>Assignee: {c.assignee}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
