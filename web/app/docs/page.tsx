import Link from 'next/link';
import { Shield, Code2, Terminal, Book, ArrowRight, Key, Zap, Lock, Building2 } from 'lucide-react';

const BASE_URL = 'https://afriverify.sankofaapp.com/v1';

const curlInitiate = `curl -X POST ${BASE_URL}/verify/initiate \\
  -H "Authorization: Bearer av_live_YOUR_KEY" \\
  -H "X-Platform: YourPlatformName" \\
  -H "Content-Type: application/json" \\
  -d '{"phone": "+2348012345678", "platform_user_id": "user_abc123"}'
# { "session_token": "...", "expires_at": "...", "next_step": "otp" }`;

const curlOtp = `# Send the OTP
curl -X POST ${BASE_URL}/verify/otp/send \\
  -H "Authorization: Bearer av_live_YOUR_KEY" \\
  -H "X-Platform: YourPlatformName" \\
  -H "Content-Type: application/json" \\
  -d '{"session_token": "SESSION_TOKEN"}'
# { "sent": true, "expires_in": 300 }

# Confirm it
curl -X POST ${BASE_URL}/verify/otp/confirm \\
  -H "Authorization: Bearer av_live_YOUR_KEY" \\
  -H "X-Platform: YourPlatformName" \\
  -H "Content-Type: application/json" \\
  -d '{"session_token": "SESSION_TOKEN", "otp": "123456"}'`;

const curlIdUpload = `curl -X POST ${BASE_URL}/verify/id/upload \\
  -H "Authorization: Bearer av_live_YOUR_KEY" \\
  -H "X-Platform: YourPlatformName" \\
  -F "session_token=SESSION_TOKEN" \\
  -F "id_type=nin" \\
  -F "id_number=12345678901" \\
  -F "nationality=NG" \\
  -F "first_name=Ada" \\
  -F "last_name=Obi" \\
  -F "dob=1995-04-12" \\
  -F "id_photo=@id-photo.jpg"`;

const curlFace = `curl -X POST ${BASE_URL}/verify/face/submit \\
  -H "Authorization: Bearer av_live_YOUR_KEY" \\
  -H "X-Platform: YourPlatformName" \\
  -F "session_token=SESSION_TOKEN" \\
  -F "selfie=@selfie.jpg"
# { "processing": true, "estimated_seconds": 30 }`;

const curlStatus = `curl ${BASE_URL}/verify/status/SESSION_TOKEN \\
  -H "Authorization: Bearer av_live_YOUR_KEY" \\
  -H "X-Platform: YourPlatformName"
# { "status": "complete", "vit": "...", "verification_level": 2, "identity_id": "..." }`;

const curlKybRegister = `curl -X POST ${BASE_URL}/kyb/register \\
  -H "Authorization: Bearer av_live_YOUR_KEY" \\
  -H "X-Platform: YourPlatformName" \\
  -H "Content-Type: application/json" \\
  -d '{
    "business_name": "Ada Trading Co",
    "registration_number": "RC1234567",
    "registration_country": "NG",
    "registration_type": "cac_ng"
  }'
# { "kyb_entity_id": "...", "verification_status": "pending", "next_steps": [...] }`;

const curlKybDocument = `curl -X POST ${BASE_URL}/kyb/KYB_ENTITY_ID/document \\
  -H "Authorization: Bearer av_live_YOUR_KEY" \\
  -H "X-Platform: YourPlatformName" \\
  -F "document=@certificate-of-incorporation.pdf"`;

const curlKybDirector = `# The director completes their own individual verification first
# (the flow above), then you attach their resulting identity:
curl -X POST ${BASE_URL}/kyb/KYB_ENTITY_ID/directors \\
  -H "Authorization: Bearer av_live_YOUR_KEY" \\
  -H "X-Platform: YourPlatformName" \\
  -H "Content-Type: application/json" \\
  -d '{"verified_identity_id": "IDENTITY_ID", "role": "director"}'
# Requires the identity to already have verification_level >= 2 (full biometric)`;

const sandboxCurl = `curl -X POST ${BASE_URL}/verify/initiate \\
  -H "Authorization: Bearer av_test_YOUR_SANDBOX_KEY" \\
  -H "X-Platform: YourPlatformName" \\
  -H "Content-Type: application/json" \\
  -d '{"phone": "+2348000000001"}'

# Then use these test document IDs at the id/upload step:
# TEST_NG_PASS_001  -> pass (trust_score 0.85)
# TEST_NG_FAIL_001  -> fail (name mismatch)
# TEST_NG_AML_001   -> aml_flagged
# TEST_NG_BL_001    -> blacklisted`;

const verifyEndpoints = [
  {
    method: 'POST',
    path: '/verify/initiate',
    desc: 'Start an individual verification session. Returns a session token.',
    body: 'phone, platform_user_id?, redirect_url?',
    returns: 'session_token, expires_at, next_step',
  },
  {
    method: 'POST',
    path: '/verify/otp/send',
    desc: 'Sends (or resends) a one-time code to the session phone number.',
    body: 'session_token',
    returns: 'sent, expires_in',
  },
  {
    method: 'POST',
    path: '/verify/otp/confirm',
    desc: 'Confirms the OTP and advances the session to the ID upload step.',
    body: 'session_token, otp',
    returns: 'confirmed, identity_id, next_step',
  },
  {
    method: 'POST',
    path: '/verify/id/upload',
    desc: 'Multipart. Uploads a government ID photo plus the holder’s declared details.',
    body: 'session_token, id_type, id_number, nationality, first_name, last_name, dob, id_photo (file)',
    returns: 'id_verified, next_step',
  },
  {
    method: 'POST',
    path: '/verify/face/submit',
    desc: 'Multipart. Uploads a selfie; triggers async biometric face-match processing.',
    body: 'session_token, selfie (file)',
    returns: 'processing, estimated_seconds',
  },
  {
    method: 'GET',
    path: '/verify/status/:session_token',
    desc: 'Poll session status. Returns the VIT once verification completes.',
    body: 'none',
    returns: 'status, vit, verification_level, identity_id, rejection_reason',
  },
  {
    method: 'GET',
    path: '/internal/users/:platform_user_id/status',
    desc: 'Check a platform user’s verification status. Sub-100ms.',
    body: 'none',
    returns: 'verified, level, trust_score, aml_status, is_blacklisted',
  },
  {
    method: 'GET',
    path: '/internal/users/:platform_user_id/vit',
    desc: 'Issue a fresh VIT for an already-verified platform user.',
    body: 'none',
    returns: 'token, payload',
  },
  {
    method: 'DELETE',
    path: '/internal/users/:platform_user_id',
    desc: 'Right-to-erasure: deletes stored photos and scrubs identifying fields (NDPA/GDPR).',
    body: 'none',
    returns: 'erased, identity_id',
  },
];

const kybEndpoints = [
  {
    method: 'POST',
    path: '/kyb/register',
    desc: 'Registers a business for verification. Creates a KYB entity, pending.',
    body: 'business_name, registration_number, registration_country, registration_type, business_address?',
    returns: 'kyb_entity_id, verification_status',
  },
  {
    method: 'POST',
    path: '/kyb/:id/document',
    desc: 'Multipart. Uploads the business’s registration certificate.',
    body: 'document (file)',
    returns: 'kyb_entity_id, verification_status',
  },
  {
    method: 'POST',
    path: '/kyb/:id/directors',
    desc: 'Attaches a director/beneficial owner by their own verified_identity_id.',
    body: 'verified_identity_id, role',
    returns: 'kyb_entity_id, verification_status',
  },
  {
    method: 'GET',
    path: '/kyb/:id/status',
    desc: 'Poll KYB progress: document, director count, screening result.',
    body: 'none',
    returns: 'verification_status, verification_level, director_count, has_document, rejection_reason',
  },
];

const errors = [
  { code: '400', label: 'validation_error', desc: 'Missing or invalid request body field.' },
  { code: '401', label: 'unauthorized', desc: 'API key missing, invalid, or the X-Platform header is missing.' },
  { code: '403', label: 'forbidden', desc: 'API key does not have the permission required for this endpoint.' },
  { code: '404', label: 'not_found', desc: 'Session token, identity, or KYB entity not found.' },
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

function EndpointList({ endpoints }: { endpoints: typeof verifyEndpoints }) {
  return (
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
            <span className="font-bold text-lg tracking-tight">AfriVerify</span>
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
          <h1 className="text-4xl font-bold mb-4">AfriVerify API Reference</h1>
          <p className="text-slate-400 text-lg max-w-2xl leading-relaxed">
            Verify African identities, verify businesses (KYB), issue portable VITs, and gate
            high-risk actions. All requests are plain HTTP, no SDK required.
          </p>
          <div className="flex items-center gap-4 mt-6 text-sm">
            <span className="text-slate-500">Base URL:</span>
            <code className="bg-white/5 text-indigo-300 px-3 py-1.5 rounded-lg font-mono text-sm">
              {BASE_URL}
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
                { href: '#verify-flow', label: 'Verify a person' },
                { href: '#kyb-flow', label: 'Verify a business' },
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
                Every request needs a bearer token in the <code className="bg-white/5 text-indigo-300 px-1 rounded">Authorization</code> header
                <span className="text-slate-400"> and </span>
                an <code className="bg-white/5 text-indigo-300 px-1 rounded">X-Platform</code> header naming your platform.
                Requests missing either are rejected with 401. Get your API key from{' '}
                <Link href="/dashboard/api-keys" className="text-indigo-400 hover:underline">dashboard &rarr; API Keys</Link>.
              </p>
              <CodeBlock lang="bash" code={`curl ${BASE_URL}/internal/users/user_abc123/status \\
  -H "Authorization: Bearer av_live_YOUR_KEY" \\
  -H "X-Platform: YourPlatformName"`} />
              <div className="mt-5 bg-white/[0.03] border border-white/10 rounded-xl p-5 text-sm space-y-2">
                <div className="flex gap-3">
                  <code className="text-indigo-300 font-mono bg-indigo-500/10 px-2 py-0.5 rounded text-xs">av_live_</code>
                  <span className="text-slate-400">Production keys. Calls real identity providers, consumes your monthly verification quota.</span>
                </div>
                <div className="flex gap-3">
                  <code className="text-amber-300 font-mono bg-amber-500/10 px-2 py-0.5 rounded text-xs">av_test_</code>
                  <span className="text-slate-400">Sandbox keys. Deterministic fake outcomes, no quota consumed, no real data.</span>
                </div>
              </div>
            </section>

            {/* Verify a person */}
            <section id="verify-flow">
              <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
                <Code2 className="w-5 h-5 text-indigo-400" /> Verify a person
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                A five-step flow: phone &rarr; OTP &rarr; government ID photo &rarr; selfie &rarr; poll for the result.
                Each step advances the same session token.
              </p>
              <div className="space-y-5">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">1. Initiate</p>
                  <CodeBlock lang="bash" code={curlInitiate} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">2. Send &amp; confirm OTP</p>
                  <CodeBlock lang="bash" code={curlOtp} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">3. Upload the government ID</p>
                  <CodeBlock lang="bash" code={curlIdUpload} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">4. Submit a selfie</p>
                  <CodeBlock lang="bash" code={curlFace} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">5. Poll for the result</p>
                  <CodeBlock lang="bash" code={curlStatus} />
                </div>
              </div>
            </section>

            {/* Verify a business */}
            <section id="kyb-flow">
              <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
                <Building2 className="w-5 h-5 text-indigo-400" /> Verify a business (KYB)
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                Business verification requires a registration document plus at least one director who has
                completed the individual verification flow above to full biometric level. Once both are in
                place, the business name is screened and the entity auto-verifies or is flagged for review.
              </p>
              <div className="space-y-5">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">1. Register the business</p>
                  <CodeBlock lang="bash" code={curlKybRegister} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">2. Upload the registration document</p>
                  <CodeBlock lang="bash" code={curlKybDocument} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">3. Attach a verified director</p>
                  <CodeBlock lang="bash" code={curlKybDirector} />
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
                No real identity providers are called, no quota consumed.
              </p>
              <div className="mb-5 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm text-amber-400">
                A sandbox key (prefix <code className="bg-amber-500/10 px-1 rounded font-mono">av_test_</code>) is required.
                Switch environments in the <Link href="/dashboard/api-keys" className="underline">dashboard</Link>.
              </div>
              <CodeBlock lang="bash" code={sandboxCurl} />
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
                Full list: <Link href="/dashboard/sandbox" className="text-indigo-400 hover:underline">Dashboard &rarr; Sandbox</Link>
                {' '}or <code className="bg-white/5 px-1 rounded">GET /v1/sandbox/credentials</code>.
              </p>
            </section>

            {/* API Reference */}
            <section id="api-reference">
              <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
                <Lock className="w-5 h-5 text-indigo-400" /> API reference
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                All endpoints return JSON. Successful responses use HTTP 2xx status codes. Paths below
                are relative to the base URL above.
              </p>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 mt-8">Individual verification</h3>
              <EndpointList endpoints={verifyEndpoints} />
              <h3 className="text-sm font-semibold text-slate-300 mb-3 mt-8">Business verification (KYB)</h3>
              <EndpointList endpoints={kybEndpoints} />
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
                <a href="mailto:support@sankofaapp.com" className="text-indigo-400 text-sm hover:underline">
                  support@sankofaapp.com
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
