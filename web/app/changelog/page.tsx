import type { Metadata } from 'next';
import { TrustShell } from '@/components/trust-shell';

export const metadata: Metadata = {
  title: 'Changelog - AfriVerify',
  description: 'What we shipped and when. Every entry is something that is live.',
};

interface Entry { date: string; title: string; tag: 'Security' | 'API' | 'Product' | 'Reliability' | 'Trust'; body: string }

// Newest first. Only list things that are live in production.
const ENTRIES: Entry[] = [
  { date: '2026-11-19', tag: 'Trust', title: 'Plain wording on the website, and fonts served from our own domain', body: 'We corrected statements that said more than we can show: the number of countries with ID checks (29, not 54), a speed figure we had not measured, what the image-screening step does, what is stored, and what a Verified Identity Token contains (it includes your name). Fonts are now served from our own domain, so opening a page no longer sends a request to Google.' },
  { date: '2026-11-19', tag: 'Security', title: 'Two-step verification for dashboard accounts', body: 'Turn it on under Account security with any authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password). Signing in then needs your password and a 6-digit code. You get 10 single-use recovery codes, wrong codes lock the second step for 15 minutes after five tries, and we email you whenever it is changed. Turning it off needs your password and a current code.' },
  { date: '2026-11-19', tag: 'Trust', title: 'Full legal framework published', body: 'New Terms of Service (with the description of the services and the fees and billing rules), Privacy Notice, Data Processing Agreement, Biometric and Liveness Notice, Acceptable Use Policy, Service Levels and Research terms are now on the website, in one place at /legal. They take effect on 19 December 2026, 30 days after publication; the earlier Terms and Privacy Policy stay readable until then.' },
  { date: '2026-11-19', tag: 'Security', title: 'Virtual-camera detection', body: 'The live scan now notices well-known virtual-camera and capture software (such as OBS Virtual Camera, ManyCam and DroidCam) and sends those attempts to review instead of approving them automatically. This is a first filter: software can disguise its name, so the screen-light check remains the main defence against injected video. We will measure how many get through in our Accuracy Studies.' },
  { date: '2026-11-19', tag: 'Product', title: 'Fairer free tier and a cap on one-time codes per session', body: 'New free live keys start at 50 verifications a month (sandbox keys keep 100), and one email address can hold two free live keys. One verification session can now request at most three one-time codes. Existing keys and paid plans are unchanged. Per-step counting (a phone check is 1 unit, an ID check 3 in total, a live face scan 5 in total) is built but not switched on: we will announce the date here and on the pricing page first, and paying customers keep their current billing period unchanged.' },
  { date: '2026-11-18', tag: 'Product', title: 'Accuracy Studies: recruitment guide, consent sheet and report', body: 'Studies now show who still needs recording (skin tone, lighting, phone models, attack types), print a bilingual participant consent sheet, and produce a printable report with methodology, confidence intervals and limitations. The report is marked DRAFT until the sample is large enough.' },
  { date: '2026-11-18', tag: 'Product', title: 'Reduced motion is now your choice, not a silent skip', body: 'People whose device asks for reduced motion no longer have the colour check dropped without being told. The skip box is ticked for them with a plain explanation (the colours change slowly and a Stop button is always on screen), and they can untick it to include the check and be eligible for automatic approval.' },
  { date: '2026-11-18', tag: 'Security', title: 'USSD callbacks now need a secret; voucher redemption needs a login', body: 'USSD verification treats a dial-in as proof of SIM possession, which is only true if the request really comes from your aggregator. Each API key now has its own private callback URL (shown once, stored only as a hash); requests without it are refused. Existing USSD setups must create their callback URL in the dashboard and update it at their aggregator. Wallet voucher checks and redemptions now require a signed-in account, are rate-limited per account, and credit the signed-in account only.' },
  { date: '2026-11-18', tag: 'Security', title: 'Stronger one-time-code limits and verified payments', body: 'One-time-code attempt limits now hold even against many simultaneous guesses, including on identity-portal login, which also gained a per-phone cap on new codes. Subscription payments are confirmed with the payment provider before a plan is activated, and processed exactly once.' },
  { date: '2026-11-18', tag: 'Trust', title: 'Public pricing, security page, live status and this changelog', body: 'Prices are served by the system that bills you. The status page records its own coverage next to availability. The security page lists what we have and what we do not.' },
  { date: '2026-11-18', tag: 'API', title: 'Idempotency keys, rate-limit headers and a public OpenAPI spec', body: 'Send Idempotency-Key and a retried request returns the original result instead of creating and billing a second verification. Every response carries RateLimit-Limit, RateLimit-Remaining and RateLimit-Reset; a 429 adds Retry-After. The contract is at /v1/openapi.yaml and /v1/openapi.json.' },
  { date: '2026-11-18', tag: 'Security', title: 'Dependency upgrades: no known vulnerabilities', body: 'The website moved to Next.js 15 and the API to current validation and ID libraries; the verification engine to a patched web framework. Builds are now reproducible from committed lockfiles.' },
  { date: '2026-11-18', tag: 'API', title: 'Bad requests return 4xx, not 500', body: 'Malformed JSON now returns 400 invalid_json, oversized bodies 413, and a disallowed origin 403. Real server errors still return 500.' },
  { date: '2026-11-18', tag: 'Product', title: 'Accuracy Studies', body: 'Consented capture of real people and known attacks, with false-accept and false-reject rates, 95% confidence intervals and a skin-tone breakdown. Participants are pseudonymous and can withdraw at any time.' },
  { date: '2026-11-18', tag: 'Reliability', title: 'SMS routing with automatic failover', body: 'One-time codes route by country across Africa’s Talking and Termii, skip a provider that keeps failing, and record which provider delivered each message.' },
  { date: '2026-11-18', tag: 'Security', title: 'Screen-light challenge against video replays', body: 'The live scan flashes a random sequence of colours on the screen and checks that the face reflects it. A photo or a video on another phone cannot. Safe by design: slow changes, a Stop button, a skip option, and no auto-approval when it cannot be measured.' },
  { date: '2026-11-18', tag: 'Security', title: 'Stronger screen-replay detection', body: 'New detection of the wavy bands left by filming a screen, heavier weight on screen glare, and a check for flat pictures tilted to fake a head turn.' },
  { date: '2026-11-18', tag: 'Product', title: 'Live face scan in the dashboard, flows and sessions', body: 'Per-flow "Require live scan", a Live Scan Lab to try it, and each attempt’s result and reasons on the Verifications page. Shareable verification links now work.' },
  { date: '2026-11-18', tag: 'Reliability', title: 'Safer releases and monitoring', body: 'A failed migration stops a deploy and the previous version keeps serving. A readiness check gates traffic. Error-rate and engine alerts are built in.' },
  { date: '2026-11-18', tag: 'Product', title: 'Our own live face scanning engine', body: 'Random liveness challenges verified on the server, plus face matching to the ID photo. Existing providers remain a fallback for borderline cases.' },
  { date: '2026-10-07', tag: 'Product', title: 'Identity portal: connect by phone', body: 'People can connect their verified identity to a platform with their phone number. Fixed a query-validation bug that returned 500 on several endpoints.' },
  { date: '2026-10-01', tag: 'Trust', title: 'Public certificate verification page', body: 'Anyone can check a verification certificate on a public page. Privacy Policy and Terms updated for new platform features.' },
  { date: '2026-09-29', tag: 'Product', title: 'Ruby SDK, webhook event log, team management and rate-limit controls', body: 'A Ruby SDK joined the others, webhook deliveries are logged, teams can share an account, and API-key rate limits are visible in the dashboard.' },
  { date: '2026-09-28', tag: 'API', title: 'Official SDKs: JavaScript, Python, Go, PHP and Java', body: 'First releases of the client libraries, with the JavaScript SDK published on npm.' },
];

const TAG: Record<Entry['tag'], string> = {
  Security: 'border-red-400/40 text-red-200',
  API: 'border-indigo-400/40 text-indigo-200',
  Product: 'border-green-400/40 text-green-200',
  Reliability: 'border-amber-400/40 text-amber-200',
  Trust: 'border-sky-400/40 text-sky-200',
};

export default function ChangelogPage() {
  return (
    <TrustShell title="Changelog" subtitle="What we shipped and when. Every entry is live in production.">
      <ol className="space-y-8">
        {ENTRIES.map((e) => (
          <li key={e.date + e.title} className="border-l-2 border-white/10 pl-6">
            <p className="flex flex-wrap items-center gap-3 text-base">
              <time dateTime={e.date} className="text-slate-300">{new Date(e.date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</time>
              <span className={`rounded-full border px-2.5 py-0.5 text-sm ${TAG[e.tag]}`}>{e.tag}</span>
            </p>
            <h2 className="mt-2 text-lg font-semibold text-white">{e.title}</h2>
            <p className="mt-1 text-base text-slate-300 leading-relaxed">{e.body}</p>
          </li>
        ))}
      </ol>
      <p className="text-base text-slate-400">Dates are when the change was merged and deployed. Work before September 2026 is not listed.</p>
    </TrustShell>
  );
}
