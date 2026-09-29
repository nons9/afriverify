'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Rocket, Key, Code2, Phone, CheckCircle2, Copy, Check,
  ChevronRight, ExternalLink, Terminal, BookOpen, Zap,
} from 'lucide-react';

function CopyBlock({ code, lang = 'bash' }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="relative group">
      <pre className={`bg-slate-950 border border-white/10 rounded-xl p-4 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed lang-${lang}`}>
        <code>{code}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
        title="Copy"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function Step({ n, title, done = false, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-5">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
          {done ? <CheckCircle2 className="w-4 h-4" /> : n}
        </div>
        <div className="w-px flex-1 bg-white/5 mt-2" />
      </div>
      <div className="pb-10 flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-white mb-3">{title}</h3>
        {children}
      </div>
    </div>
  );
}

const CURL_INITIATE = `curl -X POST https://api.afriverify.sankofaapp.com/v1/verify/initiate \\
  -H "Authorization: Bearer YOUR_SANDBOX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "+2348000000001",
    "lang": "en"
  }'`;

const CURL_OTP = `curl -X POST https://api.afriverify.sankofaapp.com/v1/verify/confirm-otp \\
  -H "Authorization: Bearer YOUR_SANDBOX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "session_token": "SESSION_TOKEN_FROM_STEP_1",
    "otp": "123456"
  }'`;

const CURL_VERIFY = `curl -X POST https://api.afriverify.sankofaapp.com/v1/verify/submit-id \\
  -H "Authorization: Bearer YOUR_SANDBOX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "session_token": "SESSION_TOKEN_FROM_STEP_1",
    "id_type": "nin",
    "id_number": "00000000001",
    "first_name": "Adaeze",
    "last_name": "Obi",
    "country": "NG"
  }'`;

const NODE_EXAMPLE = `import { AfriVerify } from 'afriverify';
import { readFileSync } from 'fs';

const client = new AfriVerify({
  apiKey: process.env.AFRIVERIFY_API_KEY!, // sandbox key = sandbox mode
});

// 1. Initiate verification session
const { session_token } = await client.verify.initiate({
  phone: '+2348000000001',
  lang: 'en',
});

// 2. Confirm OTP (sandbox always accepts '123456')
await client.verify.confirmOtp({
  session_token,
  code: '123456',
});

// 3. Upload identity document image
await client.verify.uploadId({
  session_token,
  front: readFileSync('./id-front.jpg'), // Buffer, Blob, or base64 string
});

// 4. Submit selfie for face match
await client.verify.submitFace({
  session_token,
  selfie: readFileSync('./selfie.jpg'),
});

// 5. Poll for result
const status = await client.verify.getStatus(session_token);
console.log(status.result);      // 'pass'
console.log(status.trust_score); // e.g. 412
console.log(status.identity_id); // reusable identity reference`;

const WEBHOOK_EXAMPLE = `import crypto from 'crypto';

function verifyWebhook(payload: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha512', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

// In your Express handler:
app.post('/webhooks/afriverify', express.raw({ type: '*/*' }), (req, res) => {
  const sig = req.headers['x-afriverify-signature'] as string;
  if (!verifyWebhook(req.body.toString(), sig, process.env.WEBHOOK_SECRET!)) {
    return res.status(401).send('Invalid signature');
  }
  const event = JSON.parse(req.body.toString());
  // event.type: 'verification.completed' | 'verification.failed' | ...
  console.log(event);
  res.sendStatus(200);
});`;

const TEST_NUMBERS = [
  { phone: '+2348000000001', outcome: 'Verification passes', note: 'NIN 00000000001, Nigerian identity' },
  { phone: '+2348000000002', outcome: 'AML flagged', note: 'Triggers AML_FLAGGED result' },
  { phone: '+2348000000003', outcome: 'Blacklisted', note: 'Triggers BLACKLISTED result' },
  { phone: '+2348000000004', outcome: 'Low trust score', note: 'Verification passes with trust score 35' },
  { phone: '+233200000001', outcome: 'Ghana - passes', note: 'GID verification, Ghanaian identity' },
  { phone: '+254700000001', outcome: 'Kenya - passes', note: 'Huduma number verification' },
];

export default function OnboardingPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <Rocket className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Quickstart</h1>
            <p className="text-xs text-slate-500">Go live in under 10 minutes</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {[
            { icon: Terminal, label: 'REST API', href: '#api' },
            { icon: BookOpen, label: 'Test numbers', href: '#test-numbers' },
            { icon: Zap, label: 'Webhooks', href: '#webhooks' },
          ].map(({ icon: Icon, label, href }) => (
            <a
              key={label}
              href={href}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-slate-400 hover:text-white transition-colors"
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* Steps */}
      <section id="api">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-6">Integration Steps</h2>

        <Step n={1} title="Create a sandbox API key">
          <p className="text-sm text-slate-400 mb-3">
            Head to <Link href="/dashboard/api-keys" className="text-indigo-400 hover:text-indigo-300">API Keys</Link> and
            create a key with the <span className="font-medium text-slate-300">Sandbox</span> environment selected.
            Sandbox keys are prefixed <code className="bg-white/5 px-1.5 py-0.5 rounded text-xs font-mono text-slate-300">afv_test_</code>.
          </p>
          <Link
            href="/dashboard/api-keys"
            className="inline-flex items-center gap-2 text-xs font-medium bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-lg px-3 py-2 transition-colors"
          >
            <Key className="w-3.5 h-3.5" />
            Go to API Keys
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </Step>

        <Step n={2} title="Initiate a verification session">
          <p className="text-sm text-slate-400 mb-3">
            Call <code className="bg-white/5 px-1.5 py-0.5 rounded text-xs font-mono text-slate-300">POST /v1/verify/initiate</code> with
            the user&apos;s phone number. The API returns a <code className="bg-white/5 px-1.5 py-0.5 rounded text-xs font-mono text-slate-300">session_token</code> you
            use for all subsequent steps.
          </p>
          <CopyBlock code={CURL_INITIATE} />
          <div className="mt-3 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-400">
            Sandbox always delivers OTP <strong>123456</strong> - no SMS is sent in test mode.
          </div>
        </Step>

        <Step n={3} title="Confirm the OTP">
          <p className="text-sm text-slate-400 mb-3">
            Pass the session token and the OTP code to confirm phone ownership.
          </p>
          <CopyBlock code={CURL_OTP} />
        </Step>

        <Step n={4} title="Submit the identity document">
          <p className="text-sm text-slate-400 mb-3">
            Submit the user&apos;s ID details. AfriVerify routes the check to the best provider for the
            country and ID type. Use a test number below to get a predictable outcome.
          </p>
          <CopyBlock code={CURL_VERIFY} />
        </Step>

        <Step n={5} title="Use the Node.js SDK (optional)">
          <p className="text-sm text-slate-400 mb-3">
            Install the official SDK for full TypeScript types and cleaner integration.
          </p>
          <CopyBlock code="npm install afriverify" />
          <div className="mt-3">
            <CopyBlock code={NODE_EXAMPLE} lang="ts" />
          </div>
        </Step>

        <Step n={6} title="Receive webhook events" done={false}>
          <p className="text-sm text-slate-400 mb-3">
            Register a webhook endpoint in <Link href="/dashboard/webhooks" className="text-indigo-400 hover:text-indigo-300">Webhooks</Link> and
            verify the signature on each delivery. Set up a tunnel like{' '}
            <code className="bg-white/5 px-1.5 py-0.5 rounded text-xs font-mono text-slate-300">ngrok</code> for local development.
          </p>
          <CopyBlock code={WEBHOOK_EXAMPLE} lang="ts" />
        </Step>
      </section>

      {/* Test numbers */}
      <section id="test-numbers">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Test Phone Numbers
        </h2>
        <p className="text-sm text-slate-400 mb-4">
          Use these phone numbers in Sandbox. OTP is always <strong className="text-white font-mono">123456</strong>. All
          sandbox data is isolated and never touches real registries.
        </p>
        <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-xs text-slate-500 font-medium pb-3">Phone</th>
                <th className="text-left text-xs text-slate-500 font-medium px-3 pb-3">Outcome</th>
                <th className="text-left text-xs text-slate-500 font-medium px-3 pb-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {TEST_NUMBERS.map((t) => (
                <tr key={t.phone}>
                  <td className="py-2.5">
                    <code className="text-xs font-mono text-indigo-400">{t.phone}</code>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-medium ${
                      t.outcome.includes('pass') ? 'text-emerald-400' :
                      t.outcome.includes('flagged') ? 'text-amber-400' :
                      t.outcome.includes('Blacklisted') ? 'text-rose-400' :
                      'text-slate-400'
                    }`}>{t.outcome}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{t.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        <p className="text-xs text-slate-600 mt-3">
          More test credentials including ID numbers and biometric outcomes are available in the{' '}
          <Link href="/dashboard/sandbox" className="text-indigo-400 hover:text-indigo-300">Sandbox</Link> page.
        </p>
      </section>

      {/* ID types reference */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Supported ID Types
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { code: 'nin', label: 'NIN', countries: 'Nigeria', note: 'National Identification Number' },
            { code: 'bvn', label: 'BVN', countries: 'Nigeria', note: 'Bank Verification Number' },
            { code: 'passport', label: 'Passport', countries: 'All supported', note: 'International passport' },
            { code: 'national_id', label: 'National ID', countries: 'GH, ZA, KE, and more', note: 'National ID card' },
            { code: 'huduma', label: 'Huduma Namba', countries: 'Kenya', note: 'Kenya national ID' },
            { code: 'gid', label: 'Ghana Card', countries: 'Ghana', note: "Ghana's national ID" },
            { code: 'cin', label: 'CIN / CNI', countries: 'MA, TN, DZ', note: 'Carte Nationale' },
            { code: 'cni', label: 'CNI', countries: 'CM, SN, CI', note: 'Carte Nationale Identite' },
          ].map((id) => (
            <div key={id.code} className="flex items-start gap-3">
              <code className="bg-indigo-500/10 text-indigo-400 text-xs font-mono px-2 py-1 rounded shrink-0">{id.code}</code>
              <div>
                <div className="text-sm font-medium text-white">{id.label}</div>
                <div className="text-xs text-slate-500">{id.countries} - {id.note}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Go to production */}
      <section className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <Code2 className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white mb-1">Ready to go live?</h3>
            <p className="text-xs text-slate-400 mb-3 leading-relaxed">
              Swap your sandbox key for a production key, point your code at the same API base URL, and
              you&apos;re live. Production keys are prefixed <code className="bg-white/5 px-1 py-0.5 rounded font-mono">afv_live_</code>.
              No other code changes needed.
            </p>
            <div className="flex gap-3">
              <Link
                href="/dashboard/api-keys"
                className="inline-flex items-center gap-2 text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg px-3 py-2 transition-colors"
              >
                <Key className="w-3.5 h-3.5" />
                Create production key
              </Link>
              <Link
                href="/dashboard/usage"
                className="inline-flex items-center gap-2 text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-lg px-3 py-2 transition-colors"
              >
                View pricing
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Links */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Next Steps</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { href: '/dashboard/webhooks', label: 'Configure webhooks', desc: 'Receive real-time verification events' },
            { href: '/dashboard/flows', label: 'Verification flows', desc: 'Design multi-step flows for your product' },
            { href: '/dashboard/white-label', label: 'White-label', desc: 'Brand the hosted verification UI' },
            { href: '/dashboard/provider-settings', label: 'Provider routing', desc: 'Pin or review identity provider routing' },
          ].map(({ href, label, desc }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-between border border-white/10 hover:border-white/20 rounded-xl p-4 group transition-colors"
            >
              <div>
                <div className="text-sm font-medium text-white">{label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
