import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, Clock } from 'lucide-react';
import { TrustShell } from '@/components/trust-shell';

export const metadata: Metadata = {
  title: 'Security - AfriVerify',
  description: 'How AfriVerify protects data, what we have in place today, and, plainly, what we do not have yet.',
};

const UPDATED = 'November 18, 2026';

const IN_PLACE: { title: string; body: string }[] = [
  { title: 'Encryption in transit', body: 'All traffic uses TLS with HSTS on the API and the website.' },
  { title: 'Encryption of images', body: 'ID photos, selfies and live-scan frames are encrypted with AES-256-GCM by our application before they reach storage, so a storage misconfiguration alone does not expose them.' },
  { title: 'Short retention', body: 'By default, media from verifications that never completed is deleted after 30 days. Live-scan evidence is deleted after 30 days by default. Evaluation studies set their own retention, and a participant can withdraw at any time, which deletes their images and results.' },
  { title: 'API keys are never stored', body: 'We store only a SHA-256 hash of each API key. Keys carry explicit permissions and can be revoked or suspended.' },
  { title: 'Two-step verification', body: 'Dashboard accounts can turn on two-step sign-in with any authenticator app. Codes work once, five wrong codes lock the second step for 15 minutes, recovery codes are stored only as hashes and work once, the secret is encrypted, and we email you whenever it is changed. Turning it off needs your password and a current code.' },
  { title: 'Customer isolation', body: 'Dashboard and API data is scoped to the customer account, and another account asking for it gets "not found".' },
  { title: 'Tamper-resistant audit trail', body: 'Every verification step is written to an append-only event log: the database rejects edits and deletes of those records.' },
  { title: 'Abuse and cost protection', body: 'Rate limits per API key, per IP and per phone number; per-session limits on one-time codes; one-time-code attempts are spent atomically, so a burst of parallel guesses cannot exceed the limit; atomic use counting on shareable links; limits that fail closed if their store is unavailable.' },
  { title: 'Authenticated channels', body: 'USSD callbacks carry a per-key secret (stored only as a hash, shown once, rotatable) because the carrier cannot sign them; requests without it are refused. Voucher redemption needs a signed-in account, is rate-limited per account, and credits only the account that signed in.' },
  { title: 'Payments are verified', body: 'A payment webhook is only a claim. Before any plan is activated we ask the payment provider what was really paid and require the full plan price in the plan currency. Each payment is processed once, in a single locked transaction, even if the provider delivers it several times at once.' },
  { title: 'Safe retries', body: 'Idempotency keys stop a retried request from creating or billing a second verification.' },
  { title: 'Signed webhooks', body: 'Webhook deliveries carry an HMAC signature so you can verify they came from us. Inbound email-provider webhooks are verified with a signature and a five-minute replay window.' },
  { title: 'Live-scan integrity', body: 'The server re-analyses every frame (it never trusts what a browser says it saw), issues random challenges plus a random screen-light sequence per attempt, and refuses to approve when the engine is unavailable instead of failing open.' },
  { title: 'Safer releases', body: 'A failed database migration stops a deploy and the previous working version keeps serving. A readiness check (database, cache, every migration applied) must pass before traffic moves.' },
  { title: 'Dependencies', body: `No known vulnerabilities in our web, API or verification-engine dependencies as of ${UPDATED} (npm audit and pip-audit). Lockfiles are committed so builds are reproducible.` },
  { title: 'Hardened responses', body: 'Strict transport security, content-type sniffing disabled, framing denied, referrer limited, and camera access restricted to our own pages.' },
];

const NOT_YET: string[] = [
  'SOC 2 or ISO 27001 certification. Neither has been started with an auditor.',
  'An independent penetration test. We have not commissioned one yet.',
  'Independent presentation-attack testing of the live scan (for example iBeta or a NIST-style evaluation). Our own measured results are in progress and we will publish them with confidence intervals and a skin-tone breakdown.',
  'A bug bounty programme. We accept and thank good-faith reports (below), but do not pay bounties yet.',
  'Single sign-on and IP allow-lists for the dashboard, and a way for an account owner to require two-step verification for the whole team.',
  'Customer-selectable data residency. Today the service runs in Europe and the United States.',
  'A track record on the public status page. It started recording on November 18, 2026, and shows its own coverage honestly.',
];

const SUBPROCESSORS: [string, string][] = [
  ['Railway', 'Hosting for the API, verification engine, database and cache'],
  ['Vercel', 'Hosting for the website and dashboard'],
  ['S3-compatible object storage', 'Encrypted image storage'],
  ['Africa’s Talking, Termii', 'Delivery of one-time codes by SMS'],
  ['Resend', 'Delivery of email, including email one-time codes'],
  ['Flutterwave', 'Payment processing for paid plans'],
  ['Smile Identity, Dojah, Onfido', 'Identity-document and registry checks, used only when a verification needs them'],
];

export default function SecurityPage() {
  return (
    <TrustShell title="Security" subtitle={`We would rather you trust us because we are specific than because we are loud. Last reviewed ${UPDATED}.`}>
      <section>
        <h2 className="text-xl font-semibold text-white mb-4">What is in place today</h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {IN_PLACE.map((i) => (
            <li key={i.title} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <p className="flex items-center gap-2 text-base font-semibold text-white">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-green-400" aria-hidden /> {i.title}
              </p>
              <p className="mt-2 text-base text-slate-300 leading-relaxed">{i.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-white mb-2">What we do not have yet</h2>
        <p className="text-base text-slate-300 mb-4">Security questionnaires reward confident answers. Here are ours, including the gaps.</p>
        <ul className="space-y-3">
          {NOT_YET.map((n) => (
            <li key={n} className="flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-base text-slate-200">
              <Clock className="w-5 h-5 mt-0.5 shrink-0 text-amber-300" aria-hidden />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-white mb-3">Report a vulnerability</h2>
        <div className="space-y-3 text-base leading-relaxed text-slate-200">
          <p>
            Email <a className="underline" href="mailto:security@sankofaapp.com">security@sankofaapp.com</a>. Our machine-readable policy is at{' '}
            <a className="underline" href="/.well-known/security.txt">/.well-known/security.txt</a>.
          </p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>We aim to acknowledge a report within 3 business days and to keep you updated until it is resolved.</li>
            <li>Test only against your own account or the sandbox. Do not access other customers&apos; data, degrade the service, or run automated scans against production at volume.</li>
            <li>Give us reasonable time to fix an issue before you publish it. We will not pursue good-faith research that follows these rules.</li>
          </ul>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-white mb-3">Sub-processors</h2>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-base">
            <thead className="text-left text-slate-400 border-b border-white/10">
              <tr><th className="px-4 py-3 font-medium">Provider</th><th className="px-4 py-3 font-medium">Purpose</th></tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {SUBPROCESSORS.map(([n, p]) => (
                <tr key={n}><td className="px-4 py-3 text-white">{n}</td><td className="px-4 py-3 text-slate-300">{p}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-base text-slate-300">
          Data-protection questions: <a className="underline" href="mailto:privacy@sankofaapp.com">privacy@sankofaapp.com</a>. See our <Link className="underline" href="/privacy">privacy policy</Link> and{' '}
          <Link className="underline" href="/status">live status</Link>.
        </p>
      </section>
    </TrustShell>
  );
}
