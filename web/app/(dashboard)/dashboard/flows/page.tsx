'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  GitBranch,
  Plus,
  Pencil,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';
import { api } from '@/lib/api';

interface Flow {
  id: string;
  name: string;
  description: string | null;
  required_steps: string[];
  optional_steps: string[];
  allowed_id_types: string[];
  allowed_countries: string[] | null;
  min_verification_level: number;
  success_url: string | null;
  failure_url: string | null;
  brand_name: string | null;
  brand_color: string | null;
  welcome_message: string | null;
  is_active: boolean;
  created_at: string;
}

const ALL_STEPS = ['phone', 'otp', 'id_upload', 'face_scan', 'kyb'] as const;
const ALL_ID_TYPES = ['national_id', 'passport', 'drivers_license', 'voter_id', 'residence_permit'] as const;

const STEP_LABELS: Record<string, string> = {
  phone: 'Phone',
  otp: 'OTP',
  id_upload: 'ID Upload',
  face_scan: 'Face Scan',
  kyb: 'KYB',
};

const ID_LABELS: Record<string, string> = {
  national_id: 'National ID',
  passport: 'Passport',
  drivers_license: "Driver's License",
  voter_id: 'Voter ID',
  residence_permit: 'Residence Permit',
};

const COUNTRY_CODES = [
  'NG', 'GH', 'KE', 'ZA', 'EG', 'TZ', 'UG', 'ET', 'SN', 'CI',
  'CM', 'RW', 'MA', 'TN', 'DZ', 'AO', 'MZ', 'ZM', 'ZW', 'BW',
];

const emptyForm = {
  name: '',
  description: '',
  required_steps: ['phone', 'otp'] as string[],
  optional_steps: ['id_upload', 'face_scan'] as string[],
  allowed_id_types: ['national_id', 'passport', 'drivers_license'] as string[],
  allowed_countries: null as string[] | null,
  min_verification_level: 1,
  success_url: '',
  failure_url: '',
  brand_name: '',
  brand_color: '#6366f1',
  welcome_message: '',
};

type FormData = typeof emptyForm;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        });
      }}
      className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
      title="Copy Flow ID"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function StepToggle({
  label,
  active,
  locked,
  onClick,
}: {
  label: string;
  active: boolean;
  locked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      disabled={locked}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
        active
          ? 'bg-indigo-500/15 border-indigo-500/50 text-indigo-300'
          : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-white'
      } ${locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {label}
    </button>
  );
}

function FlowForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Flow;
  onSave: (data: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormData>(
    initial
      ? {
          name: initial.name,
          description: initial.description ?? '',
          required_steps: [...initial.required_steps],
          optional_steps: [...initial.optional_steps],
          allowed_id_types: [...initial.allowed_id_types],
          allowed_countries: initial.allowed_countries ? [...initial.allowed_countries] : null,
          min_verification_level: initial.min_verification_level,
          success_url: initial.success_url ?? '',
          failure_url: initial.failure_url ?? '',
          brand_name: initial.brand_name ?? '',
          brand_color: initial.brand_color ?? '#6366f1',
          welcome_message: initial.welcome_message ?? '',
        }
      : { ...emptyForm }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [countryInput, setCountryInput] = useState('');

  function toggleStep(step: string, field: 'required_steps' | 'optional_steps') {
    setForm((f) => {
      const other = field === 'required_steps' ? 'optional_steps' : 'required_steps';
      const current = f[field];
      const next = current.includes(step)
        ? current.filter((s) => s !== step)
        : [...current, step];
      // Remove from the other list if adding here
      return {
        ...f,
        [field]: next,
        [other]: f[other].filter((s) => s !== step),
      };
    });
  }

  function toggleIdType(type: string) {
    setForm((f) => ({
      ...f,
      allowed_id_types: f.allowed_id_types.includes(type)
        ? f.allowed_id_types.filter((t) => t !== type)
        : [...f.allowed_id_types, type],
    }));
  }

  function toggleCountry(code: string) {
    setForm((f) => {
      const current = f.allowed_countries ?? [];
      const next = current.includes(code)
        ? current.filter((c) => c !== code)
        : [...current, code];
      return { ...f, allowed_countries: next.length > 0 ? next : null };
    });
  }

  function addCustomCountry() {
    const code = countryInput.trim().toUpperCase();
    if (code.length !== 2) return;
    setForm((f) => {
      const current = f.allowed_countries ?? [];
      if (current.includes(code)) return f;
      return { ...f, allowed_countries: [...current, code] };
    });
    setCountryInput('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required.'); return; }
    if (form.allowed_id_types.length === 0) { setError('Select at least one ID type.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        ...form,
        description: form.description || null as unknown as string,
        success_url: form.success_url || null as unknown as string,
        failure_url: form.failure_url || null as unknown as string,
        brand_name: form.brand_name || null as unknown as string,
        welcome_message: form.welcome_message || null as unknown as string,
      });
    } catch (err) {
      setError((err as Error).message ?? 'Failed to save flow');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name & Description */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Flow name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            maxLength={100}
            placeholder="e.g. KYC Level 2"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            maxLength={500}
            placeholder="Optional description"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Required steps */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-2">Required steps</label>
        <div className="flex flex-wrap gap-2">
          {ALL_STEPS.map((s) => (
            <StepToggle
              key={s}
              label={STEP_LABELS[s]}
              active={form.required_steps.includes(s)}
              onClick={() => toggleStep(s, 'required_steps')}
            />
          ))}
        </div>
      </div>

      {/* Optional steps */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-2">Optional steps</label>
        <div className="flex flex-wrap gap-2">
          {ALL_STEPS.map((s) => (
            <StepToggle
              key={s}
              label={STEP_LABELS[s]}
              active={form.optional_steps.includes(s)}
              locked={form.required_steps.includes(s)}
              onClick={() => toggleStep(s, 'optional_steps')}
            />
          ))}
        </div>
        <p className="text-xs text-slate-600 mt-1.5">Steps already required can&apos;t be optional.</p>
      </div>

      {/* Accepted ID types */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-2">Accepted ID types</label>
        <div className="flex flex-wrap gap-2">
          {ALL_ID_TYPES.map((t) => (
            <StepToggle
              key={t}
              label={ID_LABELS[t]}
              active={form.allowed_id_types.includes(t)}
              onClick={() => toggleIdType(t)}
            />
          ))}
        </div>
      </div>

      {/* Min verification level */}
      <div className="max-w-xs">
        <label className="block text-xs font-medium text-slate-400 mb-1.5">
          Min verification level
        </label>
        <select
          value={form.min_verification_level}
          onChange={(e) => setForm((f) => ({ ...f, min_verification_level: Number(e.target.value) }))}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
        >
          <option value={0}>0 — Phone only</option>
          <option value={1}>1 — ID document</option>
          <option value={2}>2 — Biometric</option>
        </select>
      </div>

      {/* Advanced section */}
      <div className="border border-white/10 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.03] transition-colors"
        >
          <span>Advanced settings</span>
          {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showAdvanced && (
          <div className="px-5 pb-5 space-y-5 border-t border-white/10 pt-5">
            {/* Country allow-list */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">
                Country allow-list{' '}
                <span className="text-slate-600 font-normal">(leave empty to allow all)</span>
              </label>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {COUNTRY_CODES.map((cc) => (
                  <button
                    key={cc}
                    type="button"
                    onClick={() => toggleCountry(cc)}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors border ${
                      (form.allowed_countries ?? []).includes(cc)
                        ? 'bg-indigo-500/15 border-indigo-500/50 text-indigo-300'
                        : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    {cc}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={countryInput}
                  onChange={(e) => setCountryInput(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="Other (ISO-2)"
                  maxLength={2}
                  className="w-32 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={addCustomCountry}
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-300 hover:text-white transition-colors"
                >
                  Add
                </button>
              </div>
              {(form.allowed_countries ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(form.allowed_countries ?? []).map((cc) => (
                    <span
                      key={cc}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-500/10 text-indigo-300 rounded text-xs font-mono"
                    >
                      {cc}
                      <button
                        type="button"
                        onClick={() => toggleCountry(cc)}
                        className="hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Redirect URLs */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Success redirect URL</label>
                <input
                  type="url"
                  value={form.success_url}
                  onChange={(e) => setForm((f) => ({ ...f, success_url: e.target.value }))}
                  placeholder="https://your-app.com/verified"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Failure redirect URL</label>
                <input
                  type="url"
                  value={form.failure_url}
                  onChange={(e) => setForm((f) => ({ ...f, failure_url: e.target.value }))}
                  placeholder="https://your-app.com/failed"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>
            </div>

            {/* Branding */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Brand name</label>
                <input
                  type="text"
                  value={form.brand_name}
                  onChange={(e) => setForm((f) => ({ ...f, brand_name: e.target.value }))}
                  maxLength={100}
                  placeholder="Your Company"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Brand color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.brand_color}
                    onChange={(e) => setForm((f) => ({ ...f, brand_color: e.target.value }))}
                    className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border border-white/10"
                  />
                  <input
                    type="text"
                    value={form.brand_color}
                    onChange={(e) => {
                      if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value))
                        setForm((f) => ({ ...f, brand_color: e.target.value }));
                    }}
                    maxLength={7}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-indigo-500/50 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Welcome message */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Welcome message</label>
              <textarea
                value={form.welcome_message}
                onChange={(e) => setForm((f) => ({ ...f, welcome_message: e.target.value }))}
                maxLength={500}
                rows={2}
                placeholder="Shown to users at the start of the verification widget"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Create flow'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 text-sm text-slate-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function FlowCard({
  flow,
  onEdit,
  onDelete,
}: {
  flow: Flow;
  onEdit: (f: Flow) => void;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete "${flow.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    onDelete(flow.id);
  }

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-sm font-semibold text-white">{flow.name}</span>
            {flow.brand_name && (
              <span className="text-xs text-slate-500">· {flow.brand_name}</span>
            )}
          </div>
          {flow.description && (
            <p className="text-xs text-slate-500 leading-relaxed">{flow.description}</p>
          )}
          <div className="flex items-center gap-1 mt-1">
            <code className="text-xs text-slate-600 font-mono">{flow.id.slice(0, 8)}…</code>
            <CopyButton text={flow.id} />
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(flow)}
            className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition-colors disabled:opacity-40"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
        <div>
          <span className="text-slate-500 block mb-1">Required</span>
          <div className="flex flex-wrap gap-1">
            {flow.required_steps.map((s) => (
              <span key={s} className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 rounded font-medium">
                {STEP_LABELS[s] ?? s}
              </span>
            ))}
          </div>
        </div>
        <div>
          <span className="text-slate-500 block mb-1">Optional</span>
          <div className="flex flex-wrap gap-1">
            {flow.optional_steps.length > 0
              ? flow.optional_steps.map((s) => (
                  <span key={s} className="px-2 py-0.5 bg-white/5 text-slate-400 rounded">
                    {STEP_LABELS[s] ?? s}
                  </span>
                ))
              : <span className="text-slate-600">—</span>}
          </div>
        </div>
        <div>
          <span className="text-slate-500 block mb-1">ID types</span>
          <div className="flex flex-wrap gap-1">
            {flow.allowed_id_types.map((t) => (
              <span key={t} className="px-2 py-0.5 bg-white/5 text-slate-400 rounded">
                {ID_LABELS[t] ?? t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/[0.06] text-xs text-slate-500">
        <span>Min level: <strong className="text-slate-300">{flow.min_verification_level}</strong></span>
        {flow.allowed_countries && (
          <span>Countries: <strong className="text-slate-300">{flow.allowed_countries.join(', ')}</strong></span>
        )}
        {flow.brand_color && (
          <span className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-full inline-block border border-white/10"
              style={{ background: flow.brand_color }}
            />
            {flow.brand_color}
          </span>
        )}
      </div>
    </div>
  );
}

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editing, setEditing] = useState<Flow | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ flows: Flow[] }>('/v1/developer/flows');
      setFlows(data.flows);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load flows');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(data: FormData) {
    await api.post('/v1/developer/flows', data);
    setMode('list');
    load();
  }

  async function handleUpdate(data: FormData) {
    await api.patch(`/v1/developer/flows/${editing!.id}`, data);
    setMode('list');
    setEditing(null);
    load();
  }

  async function handleDelete(id: string) {
    await api.delete(`/v1/developer/flows/${id}`);
    setFlows((f) => f.filter((flow) => flow.id !== id));
  }

  function startEdit(flow: Flow) {
    setEditing(flow);
    setMode('edit');
  }

  if (mode === 'create' || mode === 'edit') {
    return (
      <div className="p-8 max-w-3xl">
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-white">
            {mode === 'create' ? 'Create verification flow' : `Edit "${editing?.name}"`}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Configure which steps, ID types, and countries this flow allows.
          </p>
        </div>
        <FlowForm
          initial={editing ?? undefined}
          onSave={mode === 'create' ? handleCreate : handleUpdate}
          onCancel={() => { setMode('list'); setEditing(null); }}
        />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Verification Flows</h1>
          <p className="text-slate-400 text-sm mt-1">
            Define reusable verification journeys. Pass a <code className="text-indigo-300 text-xs">flow_id</code> to{' '}
            <code className="text-indigo-300 text-xs">POST /v1/verify/initiate</code> to apply it to a session.
          </p>
        </div>
        <button
          onClick={() => setMode('create')}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          New flow
        </button>
      </div>

      {/* How it works */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 mb-8">
        <h3 className="text-xs font-semibold text-white uppercase tracking-wide mb-3">How flows work</h3>
        <ul className="space-y-2 text-sm text-slate-400">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            Create a flow template once and reuse it across every session that needs the same journey.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            The session status endpoint returns the active flow config so your widget adapts automatically.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            Country allow-lists, redirect URLs, and branding are inherited by every session using the flow.
          </li>
        </ul>
        <div className="mt-4 bg-slate-900/50 rounded-lg p-4 overflow-x-auto">
          <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-medium">Usage</p>
          <pre className="text-xs text-slate-300 whitespace-pre">{`POST /v1/verify/initiate
{
  "phone": "+2348012345678",
  "flow_id": "<your-flow-id>"
}`}</pre>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 mb-6">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : flows.length === 0 ? (
        <div className="text-center py-16 bg-white/[0.03] border border-white/10 rounded-xl">
          <GitBranch className="w-10 h-10 mx-auto mb-4 text-slate-700" />
          <h3 className="text-white font-medium mb-1">No flows yet</h3>
          <p className="text-slate-500 text-sm mb-5">
            Create your first verification flow to start customizing user journeys.
          </p>
          <button
            onClick={() => setMode('create')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create flow
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {flows.map((f) => (
            <FlowCard key={f.id} flow={f} onEdit={startEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
