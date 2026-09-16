'use client';

import { useEffect, useState, useCallback } from 'react';
import { Zap, Plus, Trash2, ToggleLeft, ToggleRight, Loader2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';

interface RuleCondition {
  field: string;
  operator: string;
  value: unknown;
}

interface RiskRule {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  priority: number;
  conditions: RuleCondition[];
  conditions_mode: 'all' | 'any';
  action: 'trust_delta' | 'flag';
  action_params: { delta?: number } | null;
  created_at: string;
}

const FIELD_LABELS: Record<string, string> = {
  trust_score: 'Trust Score',
  aml_status: 'AML Status',
  verification_level: 'Verification Level',
  is_blacklisted: 'Is Blacklisted',
  country: 'Country',
};

const OP_LABELS: Record<string, string> = {
  eq: '=', ne: '≠', lt: '<', lte: '≤', gt: '>', gte: '≥', in: 'in', not_in: 'not in',
};

function conditionSummary(conditions: RuleCondition[], mode: string): string {
  if (!conditions.length) return 'No conditions';
  const parts = conditions.map((c) =>
    `${FIELD_LABELS[c.field] ?? c.field} ${OP_LABELS[c.operator] ?? c.operator} ${JSON.stringify(c.value)}`
  );
  return parts.join(mode === 'any' ? ' OR ' : ' AND ');
}

function actionLabel(rule: RiskRule): string {
  if (rule.action === 'trust_delta') {
    const d = rule.action_params?.delta ?? 0;
    return `Trust ${d >= 0 ? '+' : ''}${d}`;
  }
  return 'Flag for review';
}

function actionColour(action: string): string {
  if (action === 'trust_delta') return 'bg-amber-500/10 text-amber-400';
  return 'bg-rose-500/10 text-rose-400';
}

const DEFAULT_FORM = {
  name: '',
  description: '',
  priority: 100,
  conditions_mode: 'all' as 'all' | 'any',
  conditions: [{ field: 'trust_score', operator: 'lt', value: '' }],
  action: 'flag' as 'trust_delta' | 'flag',
  delta: '',
};

export default function RiskRulesPage() {
  const [rules, setRules] = useState<RiskRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminApi.get<{ rules: RiskRule[] }>('/v1/admin/risk-rules')
      .then((r) => setRules(r.rules))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(rule: RiskRule) {
    await adminApi.patch(`/v1/admin/risk-rules/${rule.id}`, { is_active: !rule.is_active });
    setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
  }

  async function deleteRule(id: string) {
    if (!confirm('Delete this rule? This cannot be undone.')) return;
    await adminApi.delete(`/v1/admin/risk-rules/${id}`);
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleCreate() {
    setError('');
    setSaving(true);
    try {
      const conditions = form.conditions.map((c) => ({
        ...c,
        value: isNaN(Number(c.value)) ? c.value : Number(c.value),
      }));
      const action_params = form.action === 'trust_delta' && form.delta !== ''
        ? { delta: Number(form.delta) }
        : null;
      await adminApi.post('/v1/admin/risk-rules', {
        name: form.name,
        description: form.description || undefined,
        priority: form.priority,
        conditions_mode: form.conditions_mode,
        conditions,
        action: form.action,
        action_params,
      });
      setShowCreate(false);
      setForm(DEFAULT_FORM);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-rose-400" />
          <h1 className="text-2xl font-bold text-white">Risk Rules</h1>
          <span className="text-slate-500 text-sm">({rules.length})</span>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-500 rounded-lg px-4 py-2 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Rule
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-zinc-900 border border-white/10 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">New Rule</h2>
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div className="col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">Name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Priority (lower = first)</label>
              <input type="number" value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
                className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Match mode</label>
              <select value={form.conditions_mode}
                onChange={(e) => setForm((f) => ({ ...f, conditions_mode: e.target.value as 'all' | 'any' }))}
                className="w-full bg-zinc-800 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="all">ALL conditions must match</option>
                <option value="any">ANY condition must match</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-slate-400">Conditions</label>
              <button onClick={() => setForm((f) => ({ ...f, conditions: [...f.conditions, { field: 'trust_score', operator: 'lt', value: '' }] }))}
                className="text-xs text-rose-400 hover:text-white transition-colors">+ Add condition</button>
            </div>
            <div className="space-y-2">
              {form.conditions.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={c.field}
                    onChange={(e) => setForm((f) => { const cs = [...f.conditions]; cs[i] = { ...cs[i], field: e.target.value }; return { ...f, conditions: cs }; })}
                    className="bg-zinc-800 border border-white/10 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none">
                    {Object.entries(FIELD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select value={c.operator}
                    onChange={(e) => setForm((f) => { const cs = [...f.conditions]; cs[i] = { ...cs[i], operator: e.target.value }; return { ...f, conditions: cs }; })}
                    className="bg-zinc-800 border border-white/10 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none">
                    {Object.entries(OP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input value={c.value as string}
                    onChange={(e) => setForm((f) => { const cs = [...f.conditions]; cs[i] = { ...cs[i], value: e.target.value }; return { ...f, conditions: cs }; })}
                    placeholder="value"
                    className="flex-1 bg-white/5 border border-white/10 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
                  {form.conditions.length > 1 && (
                    <button onClick={() => setForm((f) => ({ ...f, conditions: f.conditions.filter((_, j) => j !== i) }))}
                      className="text-slate-500 hover:text-rose-400 transition-colors">×</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-end gap-4 mb-4">
            <div className="flex-1">
              <label className="text-xs text-slate-400 mb-1 block">Action</label>
              <select value={form.action}
                onChange={(e) => setForm((f) => ({ ...f, action: e.target.value as 'trust_delta' | 'flag' }))}
                className="w-full bg-zinc-800 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="flag">Flag for review</option>
                <option value="trust_delta">Trust score delta</option>
              </select>
            </div>
            {form.action === 'trust_delta' && (
              <div className="w-32">
                <label className="text-xs text-slate-400 mb-1 block">Delta (e.g. -50)</label>
                <input type="number" value={form.delta}
                  onChange={(e) => setForm((f) => ({ ...f, delta: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
            )}
          </div>

          {error && <p className="text-xs text-rose-400 mb-3">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving || !form.name}
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create Rule
            </button>
            <button onClick={() => { setShowCreate(false); setForm(DEFAULT_FORM); setError(''); }}
              className="text-sm text-slate-400 hover:text-white px-4 py-2 rounded-lg transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-rose-400 animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className={`bg-zinc-900 border rounded-xl transition-colors ${rule.is_active ? 'border-white/10' : 'border-white/5 opacity-60'}`}>
              <div className="flex items-center gap-3 p-4">
                <button onClick={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
                  className="text-slate-500 hover:text-white transition-colors">
                  {expandedId === rule.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white">{rule.name}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${actionColour(rule.action)}`}>
                      {actionLabel(rule)}
                    </span>
                    <span className="text-xs text-slate-500">Priority {rule.priority}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{conditionSummary(rule.conditions, rule.conditions_mode)}</p>
                </div>
                <button onClick={() => toggleActive(rule)}
                  className={`transition-colors ${rule.is_active ? 'text-emerald-400 hover:text-slate-400' : 'text-slate-600 hover:text-emerald-400'}`}
                  title={rule.is_active ? 'Disable' : 'Enable'}>
                  {rule.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button onClick={() => deleteRule(rule.id)}
                  className="text-slate-600 hover:text-rose-400 transition-colors ml-1" title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {expandedId === rule.id && (
                <div className="px-4 pb-4 border-t border-white/5 pt-3">
                  {rule.description && <p className="text-xs text-slate-400 mb-3">{rule.description}</p>}
                  <div className="space-y-1.5">
                    {rule.conditions.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {i > 0 && <span className="text-slate-500 uppercase text-[10px] font-semibold">{rule.conditions_mode}</span>}
                        <span className="bg-white/5 text-slate-300 rounded px-2 py-0.5">
                          {FIELD_LABELS[c.field] ?? c.field} {OP_LABELS[c.operator] ?? c.operator} <strong>{JSON.stringify(c.value)}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-3">Created {new Date(rule.created_at).toLocaleDateString()}</p>
                </div>
              )}
            </div>
          ))}
          {rules.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-16 text-slate-500 text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>No rules yet. Create one to start evaluating risk signals.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
