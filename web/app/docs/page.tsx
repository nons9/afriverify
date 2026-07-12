import Link from 'next/link';
import { Shield, Code2, Terminal, Book, ArrowRight, Key, Zap, Lock } from 'lucide-react';

const jsQuickStart = `npm install @orbitverify/sdk
# or
yarn add @orbitverify/sdk`;

const jsInit = `import OrbitVerify from '@orbitverify/sdk';

const ov = new OrbitVerify({
  apiKey: process.env.ORBITVERIFY_API_KEY, // ov_live_... or ov_sandbox_...
});`;

const jsVerify = `// 1. Initiate a verification session
const session = await ov.verify.initiate({
  phone: '+2348012345678',
  country: 'NG',
  platformUserId: 'user_abc123',
});
// { token: 'sess_...', expiresAt: '...' }

// 2. Poll for completion (typically 30–120s)
const result = await ov.verify.status(session.token);
// {
//   verified: true,
//   vit: 'ov_vit_...',
//   trust_score: 0.85,
//   verification_level: 1
// }

// 3. Check a user's status anytime (sub-100ms)
const status = await ov.identity.status('user_abc123');
// { verified: true, level: 'basic', trust_score: 0.85, aml_status: 'clear' }`;

const jsVit = `// Verify a VIT the user presents to your service
const payload = await ov.vit.verify(vitToken);
// {
//   verified: true,
//   level: 'basic',
//   trust_score: 0.85,
//   aml_clear: true,
//   flags: { blacklisted: false, aml_flagged: false }
// }

// Gate a high-risk action
if (!payload.verified || payload.flags.blacklisted || payload.flags.aml_flagged) {
  throw new Error('Identity verification required');
}`;

const pyQuickStart = `pip install orbitverify`;

const pyInit = `import orbitverify

ov = orbitverify.Client(api_key=os.environ["ORBITVERIFY_API_KEY"])`;

const pyVerify = `# 1. Initiate a verification session
session = ov.verify.initiate(
    phone="+2348012345678",
    country="NG",
    platform_user_id="user_abc123",
)
# {"token": "sess_...", "expires_at": "..."}

# 2. Poll for completion
result = ov.verify.status(session["token"])
# {"verified": True, "vit": "ov_vit_...", "trust_score": 0.85}

# 3. Check a user's status anytime
status = ov.identity.status("user_abc123")
# {"verified": True, "level": "basic", "aml_status": "clear"}`;

const pyVit = `# Verify a VIT presented by the user
payload = ov.vit.verify(vit_token)

if not payload["verified"] or payload["flags"]["blacklisted"]:
    raise PermissionError("Identity verification required")`;

const sandboxJs = `const ov = new OrbitVerify({
  apiKey: 'ov_sandbox_test_key', // get from dashboard → API Keys
});

// Use these test document IDs in verify.initiate():
// TEST_NG_PASS_001  → pass (trust_score 0.85)
// TEST_NG_FAIL_001  → fail (name mismatch)
// TEST_NG_AML_001   → aml_flagged
// TEST_NG_BL_001    → blacklisted

const session = await ov.verify.initiate({
  phone: '+2348000000001',
  country: 'NG',
  documentId: 'TEST_NG_PASS_001',
  platformUserId: 'test_user_1',
});`;

const endpoints = [
  {
    method: 'POST',
    path: '/v1/verify/initiate',
    desc: 'Start a verification session. Returns a session token.',
    body: 'phone, country, platformUserId',
    returns: 'token, expiresAt',
  },
  {
    method: 'GET',
    path: '/v1/verify/status/:token',
    desc: 'Poll session status. Returns VIT once verification completes.',
    body: '—',
    returns: 'verified, vit, trust_score, verification_level',
  },
  {
    method: 'GET',
    path: '/v1/internal/users/:id/status',
    desc: 'Check a platform user's verification status. Sub-100ms.',
    body: '—',
    returns: 'verified, level, trust_score, aml_status, is_blacklisted',
  },
  {
    method: 'GET',
    path: '/v1/internal/users/:id/vit',
    desc: 'Issue a fresh VIT for an already-verified platform user.',
    body: '—',
    returns: 'token, payload',
  },
  {
    method: 'GET',
    path: '/v1/sandbox/credentials',
    desc: 'Retrieve the full table of sandbox test document IDs.',
    body: '—',
    returns: 'credentials (grouped by country)',
  },
  {
    method: 'POST',
    path: '/v1/sandbox/reset',
    desc: 'Wipe a platform user's sandbox state. Re-run the full flow from scratch.',
    body: 'platform_user_id',
    returns: 'reset, identity_deleted',
  },
];

const errors = [
  { code: '400', label: 'validation_error', desc: 'Missing or invalid request body field.' },
  { code: '401', label: 'unauthorized', desc: 'API key missing or revoked.' },
  { code: '403', label: 'sandbox_only', desc: 'Endpoint requires a sandbox key (ov_sandbox_...).' },
  { code: '403', label: 'forbidden', desc: 'API key does not have access to this resource.' },
  { code: '404', label: 'not_found', desc: 'Session token or identity not found.' },
  { code: '429', label: 'rate_limit_exceeded', desc: 'Slow down. Retry after retry_after seconds.' },
  { code: '500', label: 'internal_error', desc: 'Something went wrong on our end. Contact support.' },
];

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <div className="bg-slate-900 rounded-xl border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-black/20">
        <Terminal className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-xs text-slate-500 font-mono">{lang}</span>
      </div>
      <pre className="p-5 text-xs text-slate-300 overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-green-500/10 text-green-400',
    POST: 'bg-indigo-500/10 text-indigo-400',
    DELETE: 'bg-red-500/10 text-red-400',
  };
  return (
    <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${colors[method] ?? 'bg-slate-500/10 text-slate-400'}`}>
      {method}
    </span>
  );
}

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <span className="font-bold text-lg tracking-tight">OrbitVerify</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <Link href="/#features" className="hover:text-white transition-colors">Features</Link>
            <Link href="/#pricing" className="hover:text-white transition-colors">Pricing</Link>
            <span className="text-white">Docs</span>
            <Link href="/login" className="hover:text-white transition-colors">Sign in</Link>
          </div>
          <Link
            href="/register"
            className="bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Get API key
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 pt-28 pb-24">
        {/* Page header */}
        <div className="mb-14">
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 text-sm text-indigo-400 mb-5">
            <Book className="w-3.5 h-3.5" />
            Developer Documentation
          </div>
          <h1 className="text-4xl font-bold mb-4">OrbitVerify API Reference</h1>
          <p className="text-slate-400 text-lg max-w-2xl leading-relaxed">
            Verify African identities, issue portable VITs, and gate high-risk actions —
            all from a single API. Full SDK support for JavaScript and Python.
          </p>
          <div className="flex items-center gap-4 mt-6 text-sm">
            <span className="text-slate-500">Base URL:</span>
            <code className="bg-white/5 text-indigo-300 px-3 py-1.5 rounded-lg font-mono text-sm">
              https://api.orbitverify.africa
            </code>
          </div>
        </div>

        {/* Sidebar + content */}
        <div className="grid lg:grid-cols-[220px_1fr] gap-12">
          {/* Sidebar */}
          <aside className="hidden lg:block">
            <nav className="sticky top-28 space-y-1 text-sm">
              {[
                { href: '#authentication', label: 'Authentication' },
                { href: '#javascript', label: 'JavaScript SDK' },
                { href: '#python', label: 'Python SDK' },
                { href: '#sandbox', label: 'Sandbox testing' },
                { href: '#api-reference', label: 'API reference' },
                { href: '#errors', label: 'Errors' },
                { href: '/docs/breach-response', label: 'Breach runbook', external: true },
              ].map(({ href, label, external }) => (
                <Link
                  key={href}
                  href={href}
                  className="block px-3 py-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  {label}
                  {external && <ArrowRight className="w-3 h-3 inline ml-1 opacity-50" />}
                </Link>
              ))}
            </nav>
          </aside>

          {/* Main content */}
          <div className="space-y-16 min-w-0">

            {/* Authentication */}
            <section id="authentication">
              <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
                <Key className="w-5 h-5 text-indigo-400" /> Authentication
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                All requests require a bearer token in the <code className="bg-white/5 text-indigo-300 px-1 rounded">Authorization</code> header.
                Get your API key from the <Link href="/dashboard/api-keys" className="text-indigo-400 hover:underline">dashboard → API Keys</Link>.
              </p>
              <CodeBlock lang="bash" code={`curl https://api.orbitverify.africa/v1/identity \\
  -H "Authorization: Bearer ov_live_YOUR_KEY"`} />
              <div className="mt-5 bg-white/[0.03] border border-white/10 rounded-xl p-5 text-sm space-y-2">
                <div className="flex gap-3">
                  <code className="text-indigo-300 font-mono bg-indigo-500/10 px-2 py-0.5 rounded text-xs">ov_live_</code>
                  <span className="text-slate-400">Production keys — calls real identity providers. KYC credits consumed.</span>
                </div>
                <div className="flex gap-3">
                  <code className="text-amber-300 font-mono bg-amber-500/10 px-2 py-0.5 rounded text-xs">ov_sandbox_</code>
                  <span className="text-slate-400">Sandbox keys — deterministic fake outcomes, no credits, no real data.</span>
                </div>
              </div>
            </section>

            {/* JavaScript SDK */}
            <section id="javascript">
              <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
                <Code2 className="w-5 h-5 text-indigo-400" /> JavaScript / TypeScript SDK
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                Works in Node.js, Next.js, and Edge runtimes. Full TypeScript types included.
              </p>
              <div className="space-y-5">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">Install</p>
                  <CodeBlock lang="bash" code={jsQuickStart} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">Initialize</p>
                  <CodeBlock lang="typescript" code={jsInit} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">Verify an identity</p>
                  <CodeBlock lang="typescript" code={jsVerify} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">Gate with a VIT</p>
                  <CodeBlock lang="typescript" code={jsVit} />
                </div>
              </div>
            </section>

            {/* Python SDK */}
            <section id="python">
              <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
                <Code2 className="w-5 h-5 text-indigo-400" /> Python SDK
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                Compatible with Python 3.9+. Works in Django, FastAPI, Flask, and serverless runtimes.
              </p>
              <div className="space-y-5">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">Install</p>
                  <CodeBlock lang="bash" code={pyQuickStart} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">Initialize</p>
                  <CodeBlock lang="python" code={pyInit} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">Verify an identity</p>
                  <CodeBlock lang="python" code={pyVerify} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">Gate with a VIT</p>
                  <CodeBlock lang="python" code={pyVit} />
                </div>
              </div>
            </section>

            {/* Sandbox */}
            <section id="sandbox">
              <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
                <Zap className="w-5 h-5 text-amber-400" /> Sandbox testing
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-4">
                The sandbox environment returns deterministic outcomes for fixed test document IDs.
                No real identity providers are called. No KYC credits consumed.
              </p>
              <div className="mb-5 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm text-amber-400">
                Sandbox keys (prefix <code className="bg-amber-500/10 px-1 rounded font-mono">ov_sandbox_</code>) are required.
                Switch in the <Link href="/dashboard/api-keys" className="underline">dashboard</Link>.
              </div>
              <CodeBlock lang="typescript" code={sandboxJs} />
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left">
                      <th className="pr-4 pb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Test ID</th>
                      <th className="pr-4 pb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Country</th>
                      <th className="pb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {[
                      { id: 'TEST_NG_PASS_001', country: 'NG', outcome: 'pass' },
                      { id: 'TEST_NG_FAIL_001', country: 'NG', outcome: 'fail' },
                      { id: 'TEST_NG_AML_001',  country: 'NG', outcome: 'aml_flagged' },
                      { id: 'TEST_NG_BL_001',   country: 'NG', outcome: 'blacklisted' },
                      { id: 'TEST_GH_PASS_001', country: 'GH', outcome: 'pass' },
                      { id: 'TEST_KE_PASS_001', country: 'KE', outcome: 'pass' },
                      { id: 'TEST_PASS_PASS_001', country: 'GLOBAL', outcome: 'pass' },
                    ].map((r) => {
                      const pill: Record<string, string> = {
                        pass: 'bg-green-500/10 text-green-400',
                        fail: 'bg-red-500/10 text-red-400',
                        aml_flagged: 'bg-amber-500/10 text-amber-400',
                        blacklisted: 'bg-rose-500/10 text-rose-400',
                      };
                      return (
                        <tr key={r.id}>
                          <td className="py-3 pr-4">
                            <code className="text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded font-mono text-xs">{r.id}</code>
                          </td>
                          <td className="py-3 pr-4 text-slate-400 text-xs">{r.country}</td>
                          <td className="py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pill[r.outcome]}`}>{r.outcome}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 mt-4">
                Full list: <Link href="/dashboard/sandbox" className="text-indigo-400 hover:underline">Dashboard → Sandbox</Link>
                {' '}or <code className="bg-white/5 px-1 rounded">GET /v1/sandbox/credentials</code>.
              </p>
            </section>

            {/* API Reference */}
            <section id="api-reference">
              <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
                <Lock className="w-5 h-5 text-indigo-400" /> API reference
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                All endpoints return JSON. Successful responses use HTTP 2xx status codes.
              </p>
              <div className="space-y-3">
                {endpoints.map((ep) => (
                  <div key={ep.path} className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-2">
                      <MethodBadge method={ep.method} />
                      <code className="text-sm font-mono text-white">{ep.path}</code>
                    </div>
                    <p className="text-sm text-slate-400 mb-3">{ep.desc}</p>
                    <div className="grid sm:grid-cols-2 gap-3 text-xs text-slate-500">
                      <div>
                        <span className="text-slate-600 uppercase tracking-wider text-[10px] font-medium">Body / Params</span>
                        <p className="mt-1 font-mono text-slate-400">{ep.body}</p>
                      </div>
                      <div>
                        <span className="text-slate-600 uppercase tracking-wider text-[10px] font-medium">Returns</span>
                        <p className="mt-1 font-mono text-slate-400">{ep.returns}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Errors */}
            <section id="errors">
              <h2 className="text-2xl font-bold mb-6">Errors</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                All errors follow the same shape:{' '}
                <code className="bg-white/5 text-indigo-300 px-1 rounded">{`{ error: string, message: string }`}</code>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left">
                      {['HTTP', 'Code', 'Meaning'].map((h) => (
                        <th key={h} className="pb-3 pr-6 text-xs font-medium text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {errors.map((e) => (
                      <tr key={e.label}>
                        <td className="py-3 pr-6 font-mono text-xs text-slate-400">{e.code}</td>
                        <td className="py-3 pr-6">
                          <code className="text-xs bg-white/5 text-red-400 px-2 py-0.5 rounded">{e.label}</code>
                        </td>
                        <td className="py-3 text-sm text-slate-400">{e.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Footer CTA */}
            <div className="border-t border-white/10 pt-10 flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Questions? We&apos;re here.</p>
                <a href="mailto:support@orbitverify.africa" className="text-indigo-400 text-sm hover:underline">
                  support@orbitverify.africa
                </a>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/docs/breach-response" className="text-sm text-slate-400 hover:text-white transition-colors">
                  Breach runbook
                </Link>
                <Link
                  href="/register"
                  className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
                >
                  Get API key <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
