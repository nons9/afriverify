import Link from 'next/link';
import {
  Shield,
  Zap,
  Globe,
  BarChart2,
  Lock,
  Cpu,
  Check,
  ArrowRight,
  Code2,
  ScanFace,
} from 'lucide-react';
import { AfriVerifyLogo, AfriVerifyMark } from '@/components/logo';
import { Copyright } from '@/components/copyright';

const features = [
  {
    icon: Globe,
    title: '29 Countries With ID Checks',
    desc: 'NIN, BVN, national ID cards and passports, checked against official registries through our identity providers. Phone and email checks work wherever a text or an email can reach.',
  },
  {
    icon: Zap,
    title: 'Verify Once, Reuse',
    desc: 'Connect an existing verified identity to your platform without asking the person to verify again.',
  },
  {
    icon: Shield,
    title: 'AfriShield Active Defense',
    desc: 'DeepScan screens ID photos and selfies for signs of tampering, screenshots and low quality before they reach identity providers. A first filter, not a guarantee.',
  },
  {
    icon: Lock,
    title: 'Encrypted, Short-Lived Images',
    desc: 'ID photos and selfies are encrypted with AES-256-GCM and deleted automatically: after 30 days if a check was never completed, 12 months after it was. ID numbers are kept only as hashes.',
  },
  {
    icon: BarChart2,
    title: 'Cross-Platform Trust Score',
    desc: 'A reputation score that follows the identity across the platforms that connect it.',
  },
  {
    icon: Cpu,
    title: 'Portable VIT',
    desc: 'One RS256-signed Verified Identity Token. Verify once and share it with any platform that accepts it.',
  },
];

const pricing = [
  {
    name: 'Sandbox',
    price: 'Free',
    priceSub: '',
    limit: '100 verifications / month',
    features: ['All API endpoints', 'Sandbox environment', 'VIT generation', 'Community support'],
    cta: 'Start free',
    href: '/register',
    highlight: false,
  },
  {
    name: 'Starter',
    price: '$49',
    priceSub: '/mo',
    limit: '2,000 verifications / month',
    features: ['Production environment', 'AfriShield included', 'Usage analytics', 'Webhooks', 'Email support'],
    cta: 'Get started',
    href: '/register',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    priceSub: '',
    limit: 'Custom volume',
    features: ['Everything in Starter', 'Custom SLA', 'Dedicated support', 'Shared fraud-signal API', 'Custom contracts'],
    cta: 'Contact sales',
    href: 'mailto:sales@sankofaapp.com',
    highlight: false,
  },
];

const code = `// 1. Initiate a verification session
const { token } = await fetch('/v1/verify/initiate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer av_live_xxxx',
    'X-Platform': 'your-app',
  },
  body: JSON.stringify({ phone: '+2348012345678', country: 'NG' }),
}).then(r => r.json());

// 2. Guide user through OTP + ID + face
// ...your UI flow...

// 3. Poll for the Verified Identity Token (VIT)
const { vit, trust_score } = await fetch(
  \`/v1/verify/status/\${token}\`
).then(r => r.json());
// { verified: true, trust_score: 412, vit: "av_vit_..." }`;

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <AfriVerifyLogo size={30} textSize="text-lg" />
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            <Link href="/login" className="hover:text-white transition-colors">Sign in</Link>
          </div>
          <Link
            href="/register"
            className="bg-indigo-500 hover:bg-indigo-400 text-ink text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Get API key
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-36 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 text-sm text-indigo-400 mb-6">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            Now live - ID checks in 29 African countries
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            Identity infrastructure
            <br />
            <span className="bg-gradient-to-r from-gold-300 to-gold-500 bg-clip-text text-transparent">
              built for Africa
            </span>
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Verify identities across Africa with a single API call. Issue portable Verified Identity
            Tokens. Let your users carry their trust score to every platform that accepts it.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-ink font-semibold px-8 py-4 rounded-xl text-lg transition-colors"
            >
              Start building free <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#how-it-works"
              className="text-slate-400 hover:text-white font-medium px-8 py-4 transition-colors"
            >
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <div className="border-y border-white/10 bg-white/[0.02] py-10">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { v: '29', l: 'Countries with ID checks' },
            { v: 'AES-256', l: 'Image encryption' },
            { v: 'RS256', l: 'VIT signing algorithm' },
            { v: '12 mo', l: 'Longest image retention' },
          ].map(({ v, l }) => (
            <div key={l}>
              <div className="text-3xl font-bold text-white mb-1">{v}</div>
              <div className="text-sm text-slate-500">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Built for how Africa verifies</h2>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">
              Phone-first checks, USSD for feature phones, a low-data mode, English and French, and registry checks in 29 countries.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 hover:border-indigo-500/30 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 text-indigo-400" />
                </div>
                <h3 className="font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live face scan */}
      <section id="live-scan" className="py-24 px-6 border-t border-white/10">
        <div className="max-w-5xl mx-auto grid gap-12 md:grid-cols-2 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-medium text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-3 py-1 mb-5">
              <ScanFace className="w-3.5 h-3.5" /> New: live face scan
            </div>
            <h2 className="text-4xl font-bold mb-4">Know a real person is there</h2>
            <p className="text-slate-400 text-lg leading-relaxed mb-6">
              A photo, a screen replay or a deepfake can fool a selfie upload. Our own liveness engine asks the user to
              follow a short, random set of prompts on a live camera, then matches that face to their ID.
            </p>
            <ul className="space-y-3 text-slate-300 mb-8">
              {[
                'Random turn, blink and smile prompts that a recording cannot predict',
                'Every frame re-checked on the server, plus screen-replay and loop detection',
                'Matched to the ID photo, with evidence encrypted and deleted on schedule',
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <Check className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/register" className="bg-indigo-500 hover:bg-indigo-400 text-ink font-semibold px-6 py-3 rounded-xl transition-colors">
                Try it free
              </Link>
              <Link href="/docs#live-scan" className="text-slate-300 hover:text-white transition-colors">
                Read the docs
              </Link>
            </div>
          </div>

          {/* illustration: the scan viewfinder with the three prompts */}
          <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
            <div className="rounded-3xl border border-white/10 bg-slate-900 p-6">
              <div className="relative aspect-[4/3] rounded-2xl bg-slate-950 overflow-hidden">
                <svg viewBox="0 0 100 75" className="absolute inset-0 w-full h-full">
                  <ellipse cx="50" cy="37" rx="19" ry="26" fill="none" stroke="#C9960E" strokeWidth="0.8" />
                  <ellipse cx="50" cy="31" rx="9" ry="11" fill="#2A241B" />
                  <path d="M30 70c3-14 12-20 20-20s17 6 20 20z" fill="#2A241B" />
                  <g fill="#C9960E">
                    <path d="M6 6h12v3H9v9H6z" /><path d="M94 6H82v3h9v9h3z" />
                    <path d="M6 69h12v-3H9v-9H6z" /><path d="M94 69H82v-3h9v-9h3z" />
                  </g>
                </svg>
              </div>
              <div className="mt-5 flex flex-wrap gap-2 justify-center text-xs">
                <span className="rounded-full border border-white/10 px-3 py-1.5 text-slate-300">1 Turn your head</span>
                <span className="rounded-full border border-white/10 px-3 py-1.5 text-slate-300">2 Blink slowly</span>
                <span className="rounded-full border border-[#C9960E]/50 bg-[#C9960E]/10 px-3 py-1.5 text-[#E0BE66]">3 Smile</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works + code */}
      <section id="how-it-works" className="py-20 px-6 bg-white/[0.02] border-y border-white/10">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold mb-4">Integrate in minutes</h2>
            <p className="text-slate-400 mb-8 leading-relaxed">
              A few API calls to verify an identity. One token that any accepting platform can check.
            </p>
            <ol className="space-y-4">
              {[
                'Initiate a verification session',
                'Guide the user through OTP + ID + face match',
                'Receive a signed Verified Identity Token',
                'Check trust score anytime, sub-100ms',
              ].map((step, i) => (
                <li key={step} className="flex items-start gap-3 text-sm text-slate-300">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-indigo-500/20 text-indigo-400 text-xs flex items-center justify-center font-bold mt-0.5">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 mt-8 text-indigo-400 hover:text-indigo-300 font-medium text-sm transition-colors"
            >
              Get your API key <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="bg-slate-900 rounded-2xl border border-white/10 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-black/20">
              <Code2 className="w-4 h-4 text-slate-500" />
              <span className="text-xs text-slate-500">verify.ts</span>
            </div>
            <pre className="p-5 text-xs text-slate-300 overflow-x-auto leading-relaxed">
              <code>{code}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Simple, transparent pricing</h2>
            <p className="text-slate-400 text-lg">Start free. Scale as you grow.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {pricing.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl border p-7 flex flex-col ${
                  plan.highlight
                    ? 'bg-indigo-500/10 border-indigo-500/40'
                    : 'bg-white/[0.03] border-white/10'
                }`}
              >
                {plan.highlight && (
                  <div className="text-xs text-indigo-400 font-semibold uppercase tracking-widest mb-3">
                    Most popular
                  </div>
                )}
                <div className="text-xl font-bold mb-1">{plan.name}</div>
                <div className="flex items-baseline gap-0.5 mb-1">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  {plan.priceSub && <span className="text-slate-400 text-sm">{plan.priceSub}</span>}
                </div>
                <div className="text-xs text-slate-500 mb-6">{plan.limit}</div>
                <ul className="space-y-3 flex-1 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-slate-300">
                      <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`block text-center py-3 rounded-xl font-semibold text-sm transition-colors ${
                    plan.highlight
                      ? 'bg-indigo-500 hover:bg-indigo-400 text-ink'
                      : 'border border-white/20 hover:border-white/40 text-white'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-white/10">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-4">Start verifying today</h2>
          <p className="text-slate-400 mb-8">100 free verifications. No credit card required.</p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-ink font-semibold px-8 py-4 rounded-xl text-lg transition-colors"
          >
            Create your account <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <AfriVerifyLogo size={22} textSize="text-sm" />
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/security" className="hover:text-white transition-colors">Security</Link>
            <Link href="/status" className="hover:text-white transition-colors">Status</Link>
            <Link href="/changelog" className="hover:text-white transition-colors">Changelog</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/my-identity/login" className="hover:text-white transition-colors">Manage your identity</Link>
            <a href="mailto:hello@sankofaapp.com" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-6 text-center md:text-left text-xs text-slate-500">
          <Copyright />
        </div>
      </footer>
    </div>
  );
}
