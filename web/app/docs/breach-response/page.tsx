import Link from 'next/link';
import { Shield, AlertTriangle, Clock, Search, Bell, RefreshCw, FileText, ArrowLeft, CheckCircle } from 'lucide-react';

const phases = [
  {
    id: 'detect',
    icon: AlertTriangle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    time: '0 – 15 min',
    title: 'Detect & declare',
    owner: 'On-call engineer',
    steps: [
      'Confirm the alert is a genuine breach (not a test, scanner, or misconfigured webhook).',
      'Declare an incident in Slack #incidents: "P0 BREACH — [brief description]". Pin the message.',
      'Page the incident lead (CEO / CTO) immediately. Do not wait.',
      'Do NOT delete logs, rotate keys, or restart services until the incident lead says so — it destroys evidence.',
    ],
    checklist: [
      'Incident declared in Slack',
      'Incident lead paged',
      'No evidence destroyed',
    ],
  },
  {
    id: 'contain',
    icon: Clock,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    time: '15 min – 2 hr',
    title: 'Contain',
    owner: 'Incident lead + on-call',
    steps: [
      'Identify the blast radius: which identities, platforms, and API keys were in scope.',
      'Revoke all API keys in the affected environment via dashboard → API Keys → Revoke all. Document which keys were revoked and when.',
      'If the breach involves the signing key (RS256 private key for VIT): rotate it immediately in the secrets manager, then republish the JWKS endpoint. All existing VITs become invalid — communicate this to affected platforms.',
      'Block the attacker IP / CIDR at the WAF / load balancer level. Do not terminate the connection cleanly (TCP RST is fine — it generates a log entry).',
      'If OrbitShield signals a spike in aml_flagged or blacklisted lookups on a single key, auto-suspend that key (or suspend it manually) and record the identity IDs queried.',
      'Snapshot the relevant DB tables (platform_connections, verified_identities, api_keys, audit_events) to a write-once store before any cleanup.',
    ],
    checklist: [
      'Blast radius identified',
      'Affected API keys revoked',
      'Signing key rotated (if applicable)',
      'Attacker IP blocked',
      'DB snapshot taken',
    ],
  },
  {
    id: 'investigate',
    icon: Search,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/20',
    time: '2 – 24 hr',
    title: 'Investigate',
    owner: 'Security lead',
    steps: [
      'Pull full audit_events for affected identity IDs. Look for unusual event_type values (status_check storms, bulk vit_issued, unexpected platform_connection events).',
      'Correlate API key usage with IP addresses in the access logs. One key from many IPs = key compromise. Many keys from one IP = credential stuffing.',
      'Check OrbitShield fraud graph for patterns: was this a single actor or a coordinated ring?',
      'Determine root cause: leaked key, compromised signing secret, misconfigured CORS, injection, or insider.',
      'Preserve all evidence with timestamps. Use SHA-256 hashes to establish chain of custody if law enforcement may be involved.',
      'Draft a timeline: first evidence of the breach → detection → containment → now.',
    ],
    checklist: [
      'Audit log reviewed',
      'Root cause identified',
      'Timeline drafted',
      'Evidence preserved with hashes',
    ],
  },
  {
    id: 'notify',
    icon: Bell,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    time: '< 72 hr from discovery',
    title: 'Notify',
    owner: 'CEO + Legal',
    steps: [
      'Affected platforms: email the platform\'s registered address with (a) what happened, (b) which of their users are affected, (c) what data was exposed, (d) what we have done, (e) what they should do. Use plain language — no weasel words.',
      'Affected identities: if PII was exposed, notify affected users directly if you have their contact (phone or email). Be specific — do not send vague "security incident" emails.',
      'Regulators: Nigeria\'s NDPC requires breach notification within 72 hours of discovery under the NDPA 2023. Other countries\' data authorities as applicable.',
      'Do NOT post on social media until regulatory notifications are filed or legal has cleared it.',
      'Log every notification: to whom, when sent, message ID or email thread.',
    ],
    checklist: [
      'Affected platforms notified',
      'Affected users notified (if contact available)',
      'NDPC/regulators notified within 72h',
      'Notification log completed',
    ],
  },
  {
    id: 'recover',
    icon: RefreshCw,
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    time: '24 – 72 hr',
    title: 'Recover',
    owner: 'Incident lead',
    steps: [
      'Issue new API keys to affected platforms. Coordinate the rotation — do not leave platforms broken.',
      'If the VIT signing key was rotated: work with each platform to re-verify affected users or accept a grace-period re-issuance.',
      'Re-enable services in staging first, validate with sandbox credentials, then cut over production.',
      'Verify OrbitShield fraud graph is clean — no residual fraud signals from the incident period.',
      'Remove WAF blocks once the threat is neutralized (keep the block rule, disable it).',
      'Monitor for 48 hours post-recovery: watch for recurrence, unusual lookup patterns, or new attacker pivots.',
    ],
    checklist: [
      'New API keys issued to all affected platforms',
      'VIT re-issuance coordinated (if signing key rotated)',
      'Production restored from staging',
      'Post-recovery monitoring active',
    ],
  },
  {
    id: 'postmortem',
    icon: FileText,
    color: 'text-slate-400',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/20',
    time: '< 7 days post-recovery',
    title: 'Post-mortem',
    owner: 'All responders',
    steps: [
      'Write a blameless post-mortem: timeline, root cause, impact, what worked, what didn\'t, action items.',
      'Assign every action item an owner and a due date. Put them in the sprint immediately — not a backlog.',
      'Typical action items: add a detection test for the attack vector, improve alerting thresholds, tighten CORS/network policies, add rate limiting to newly discovered exposure, improve runbook steps that were unclear.',
      'Share the post-mortem with all connected platforms. Transparency builds trust.',
      'Store the post-mortem in a versioned location (GitHub, Notion). Link it from this runbook.',
    ],
    checklist: [
      'Post-mortem written',
      'Action items assigned and dated',
      'Post-mortem shared with platforms',
      'Runbook updated if steps were wrong',
    ],
  },
];

const contacts = [
  { role: 'Incident lead (CTO)', contact: 'Page via on-call rotation', note: 'Always first call for P0' },
  { role: 'CEO', contact: 'Direct call', note: 'Notify within 30 min of P0 declaration' },
  { role: 'Legal / Compliance', contact: 'legal@verifyafrica.com', note: 'Required for regulatory notifications' },
  { role: 'NDPC (Nigeria)', contact: 'info@ndpc.gov.ng', note: 'Mandatory within 72h under NDPA 2023' },
  { role: 'Platform support', contact: 'support@verifyafrica.com', note: 'External escalations from platforms' },
];

export default function BreachResponsePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <span className="font-bold text-lg tracking-tight">VerifyAfrica</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            <Link href="/login" className="hover:text-white transition-colors">Sign in</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 pt-28 pb-24">
        {/* Breadcrumb */}
        <Link href="/docs" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" />
          Back to docs
        </Link>

        {/* Header */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-full px-4 py-1.5 text-sm text-red-400 mb-5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Security Runbook
          </div>
          <h1 className="text-4xl font-bold mb-4">Breach Response Runbook</h1>
          <p className="text-slate-400 text-lg leading-relaxed">
            Step-by-step procedures for detecting, containing, investigating, and recovering from
            a security incident. Keep this tab open if an alert fires.
          </p>
          <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-400">
            <strong>If you are in an active incident:</strong> go directly to{' '}
            <a href="#detect" className="underline">Phase 1 → Detect & declare</a>.
            Do not read the whole document first.
          </div>
        </div>

        {/* Phases */}
        <div className="space-y-10">
          {phases.map((phase, i) => {
            const Icon = phase.icon;
            return (
              <section key={phase.id} id={phase.id}>
                <div className={`border rounded-2xl overflow-hidden ${phase.border}`}>
                  {/* Phase header */}
                  <div className={`${phase.bg} px-6 py-4 flex items-center justify-between`}>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-500 w-5">{i + 1}</span>
                      <div className={`w-8 h-8 rounded-lg ${phase.bg} border ${phase.border} flex items-center justify-center`}>
                        <Icon className={`w-4 h-4 ${phase.color}`} />
                      </div>
                      <div>
                        <h2 className="font-bold text-white">{phase.title}</h2>
                        <p className="text-xs text-slate-500">Owner: {phase.owner}</p>
                      </div>
                    </div>
                    <span className={`text-xs font-mono px-2.5 py-1 rounded-full border ${phase.border} ${phase.color}`}>
                      {phase.time}
                    </span>
                  </div>

                  {/* Steps */}
                  <div className="px-6 py-5 bg-white/[0.02] border-t border-white/5">
                    <ol className="space-y-3">
                      {phase.steps.map((step, si) => (
                        <li key={si} className="flex gap-3 text-sm text-slate-300 leading-relaxed">
                          <span className={`shrink-0 mt-0.5 text-xs font-bold w-5 h-5 rounded-full ${phase.bg} ${phase.color} flex items-center justify-center`}>
                            {si + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Checklist */}
                  <div className="px-6 py-4 border-t border-white/5 bg-black/10">
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">Completion checklist</p>
                    <ul className="space-y-2">
                      {phase.checklist.map((item) => (
                        <li key={item} className="flex items-center gap-2 text-sm text-slate-400">
                          <CheckCircle className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        {/* Contacts */}
        <section className="mt-14">
          <h2 className="text-xl font-bold mb-6">Emergency contacts</h2>
          <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    {['Role', 'Contact', 'Note'].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {contacts.map((c) => (
                    <tr key={c.role} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5 font-medium text-white">{c.role}</td>
                      <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">{c.contact}</td>
                      <td className="px-5 py-3.5 text-slate-500 text-xs">{c.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Severity guide */}
        <section className="mt-10">
          <h2 className="text-xl font-bold mb-6">Severity guide</h2>
          <div className="space-y-3">
            {[
              { sev: 'P0', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', desc: 'Active breach, signing key exposure, bulk identity data exfiltration. Page incident lead immediately.' },
              { sev: 'P1', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', desc: 'Suspected compromise, abnormal lookup volumes, single compromised API key. Contain within 1h.' },
              { sev: 'P2', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', desc: 'Potential misconfiguration, low-volume anomalous activity. Investigate within 24h.' },
              { sev: 'P3', color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20', desc: 'Security improvement or near-miss. Schedule remediation in next sprint.' },
            ].map((s) => (
              <div key={s.sev} className={`flex gap-4 items-start border rounded-xl px-5 py-4 ${s.border} ${s.bg}`}>
                <span className={`font-mono font-bold text-sm w-7 shrink-0 mt-0.5 ${s.color}`}>{s.sev}</span>
                <p className="text-sm text-slate-300 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <div className="mt-14 pt-10 border-t border-white/10 flex items-center justify-between text-sm text-slate-500">
          <span>Keep this runbook accurate. Update it after every incident post-mortem.</span>
          <Link href="/docs" className="text-indigo-400 hover:underline">
            ← Back to docs
          </Link>
        </div>
      </div>
    </div>
  );
}
