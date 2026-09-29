'use client';

import { useEffect, useState } from 'react';
import { Paintbrush, Save, ExternalLink, AlertCircle, CheckCircle2, Loader2, Shield } from 'lucide-react';
import { api } from '@/lib/api';

interface Config {
  company_name: string;
  logo_url: string | null;
  primary_color: string;
  button_color: string | null;
}

const DEFAULT_COLOR = '#4F46E5';

export default function WhiteLabelPage() {
  const [config, setConfig] = useState<Config>({
    company_name: '',
    logo_url: null,
    primary_color: DEFAULT_COLOR,
    button_color: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [useCustomButton, setUseCustomButton] = useState(false);

  useEffect(() => {
    api.get<Config>('/v1/developer/white-label').then((data) => {
      setConfig({
        company_name: data.company_name ?? '',
        logo_url: data.logo_url ?? null,
        primary_color: data.primary_color ?? DEFAULT_COLOR,
        button_color: data.button_color ?? null,
      });
      setUseCustomButton(!!data.button_color);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      await api.put('/v1/developer/white-label', {
        company_name: config.company_name,
        logo_url: config.logo_url || null,
        primary_color: config.primary_color,
        button_color: useCustomButton ? (config.button_color || config.primary_color) : null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError((err as Error).message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const primary = config.primary_color || DEFAULT_COLOR;
  const btnColor = useCustomButton ? (config.button_color || primary) : primary;

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
          <Paintbrush className="w-4.5 h-4.5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">White-label Verification</h1>
          <p className="text-sm text-slate-400">Brand the hosted verification flow with your identity</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-white">Branding</h2>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Company name</label>
              <input
                type="text"
                required
                value={config.company_name}
                onChange={e => setConfig(c => ({ ...c, company_name: e.target.value }))}
                placeholder="PesaPro"
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
              <p className="text-xs text-slate-500 mt-1">Shown in the header of your hosted verification page.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Logo URL</label>
              <input
                type="url"
                value={config.logo_url ?? ''}
                onChange={e => setConfig(c => ({ ...c, logo_url: e.target.value || null }))}
                placeholder="https://your-cdn.com/logo.png"
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
              <p className="text-xs text-slate-500 mt-1">PNG or SVG, max 180×40px. Hosted on a public CDN.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Brand color</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={config.primary_color}
                  onChange={e => setConfig(c => ({ ...c, primary_color: e.target.value }))}
                  className="w-9 h-9 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                />
                <input
                  type="text"
                  value={config.primary_color}
                  onChange={e => {
                    const v = e.target.value;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setConfig(c => ({ ...c, primary_color: v }));
                  }}
                  maxLength={7}
                  className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Used for step indicators and progress.</p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <input
                  id="custom-btn"
                  type="checkbox"
                  checked={useCustomButton}
                  onChange={e => setUseCustomButton(e.target.checked)}
                  className="rounded border-white/20"
                />
                <label htmlFor="custom-btn" className="text-xs font-medium text-slate-400 cursor-pointer">
                  Use a separate button color
                </label>
              </div>
              {useCustomButton && (
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={config.button_color ?? config.primary_color}
                    onChange={e => setConfig(c => ({ ...c, button_color: e.target.value }))}
                    className="w-9 h-9 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                  />
                  <input
                    type="text"
                    value={config.button_color ?? ''}
                    onChange={e => {
                      const v = e.target.value;
                      if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setConfig(c => ({ ...c, button_color: v || null }));
                    }}
                    maxLength={7}
                    placeholder="#4F46E5"
                    className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}
            </div>
          </div>

          {saveError && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {saveError}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : saved
                ? <><CheckCircle2 className="w-4 h-4" /> Saved</>
                : <><Save className="w-4 h-4" /> Save branding</>
            }
          </button>
        </form>

        {/* Live preview */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-white">Preview</h2>
          <div className="bg-slate-950 border border-white/10 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-3 uppercase tracking-wide">Hosted flow header</p>

            <div className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden">
              {/* Preview header */}
              <div className="flex flex-col items-center gap-2 pt-5 pb-3 px-4">
                {config.logo_url ? (
                  <img
                    src={config.logo_url}
                    alt="logo preview"
                    className="h-8 max-w-[140px] object-contain"
                    onError={e => (e.currentTarget.style.display = 'none')}
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: primary }}
                  >
                    <Shield className="w-4.5 h-4.5 text-white" />
                  </div>
                )}
                {config.company_name && (
                  <span className="text-white text-sm font-semibold">{config.company_name}</span>
                )}
              </div>

              {/* Step indicator preview */}
              <div className="flex justify-center gap-2 pb-3 px-4">
                {['Phone', 'ID', 'Face'].map((label, i) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className="flex flex-col items-center gap-0.5">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                        style={
                          i === 0
                            ? { background: primary, color: '#fff' }
                            : i === 1
                              ? { background: primary + '22', color: primary, border: `2px solid ${primary}` }
                              : { background: '#1e293b', color: '#64748b', border: '2px solid #334155' }
                        }
                      >
                        {i === 0 ? '✓' : i + 1}
                      </div>
                      <span className="text-[9px]" style={{ color: i <= 1 ? primary : '#475569' }}>{label}</span>
                    </div>
                    {i < 2 && (
                      <div className="w-6 h-px mt-[-10px]" style={{ background: i === 0 ? primary : '#334155' }} />
                    )}
                  </div>
                ))}
              </div>

              {/* OTP field preview */}
              <div className="px-4 pb-5 space-y-3">
                <div>
                  <p className="text-white text-xs font-semibold">Verify your number</p>
                  <p className="text-slate-400 text-[10px] mt-0.5">Enter the code sent to your phone.</p>
                </div>
                <div className="bg-slate-800 border border-white/10 rounded-lg py-2 text-center text-slate-600 text-base tracking-[0.5em] font-mono">
                  ••••••
                </div>
                <div
                  className="w-full py-2 rounded-lg text-white text-xs font-medium text-center"
                  style={{ background: btnColor }}
                >
                  Confirm →
                </div>
              </div>
            </div>

            {/* Hosted URL */}
            <div className="mt-3 bg-slate-900 border border-white/10 rounded-lg px-3 py-2">
              <p className="text-xs text-slate-500 mb-1">Hosted flow URL pattern</p>
              <div className="flex items-center gap-1.5">
                <code className="text-xs text-slate-300 flex-1 truncate">
                  {typeof window !== 'undefined' ? window.location.origin : 'https://afriverify.sankofaapp.com'}
                  /verify/
                  <span className="text-indigo-400">{'{'}</span>
                  session_token
                  <span className="text-indigo-400">{'}'}</span>
                </code>
                <ExternalLink className="w-3.5 h-3.5 text-slate-600 shrink-0" />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/[0.06]">
            <p className="text-xs font-medium text-white mb-2">How to use</p>
            <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside">
              <li>Save your branding above.</li>
              <li>Create a verification session via <code className="text-indigo-300">POST /v1/verify/initiate</code></li>
              <li>
                Redirect your user to{' '}
                <code className="text-indigo-300">/verify/{'{session_token}'}</code>
              </li>
              <li>The flow handles OTP, ID, and face - fully branded.</li>
              <li>On completion, the user is sent to your <code className="text-indigo-300">redirect_url</code>.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
