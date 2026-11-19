import type { Metadata } from 'next';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { TrustShell } from '@/components/trust-shell';

export const metadata: Metadata = {
  title: 'Pricing - AfriVerify',
  description: 'Simple, public pricing for identity verification in Africa. Start free, pay for what you use.',
};
export const revalidate = 300;

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

interface Plans {
  currency: string;
  local_currencies?: string[];
  registry_checks?: { fees: { scope: string; cents: number }[]; topup_usd: { min: number; max: number } };
  free: { monthly_limit: number; price_monthly_cents: number; sandbox_limit?: number };
  units?: { phone_check: number; id_check_total: number; face_check_total: number; effective_at: string | null };
  plans: { id: string; label: string; price_monthly_cents: number; monthly_limit: number; cents_per_verification: number; local_prices?: Record<string, number> }[];
  overage_cents_per_verification: number;
  enterprise: { custom: boolean; contact: string };
}

function unitsLine(u: Plans['units']) {
  if (!u?.effective_at) return <li>Every verification session you start counts once toward your monthly limit, however many steps it has.</li>;
  const when = new Date(u.effective_at);
  const on = when.getTime() <= Date.now();
  const date = when.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return (
    <li>
      A verification is counted in units by how far it goes: a phone check is {u.phone_check} unit, a session that adds an ID check is {u.id_check_total} units in total, and one that also adds a live face scan is {u.face_check_total} units in total.{' '}
      {on ? `This has applied since ${date}.` : `This starts on ${date}. Until then every session counts once. If you already pay for a plan, your current billing period is unchanged and the new counting starts when it ends.`}
    </li>
  );
}

async function loadPlans(): Promise<Plans | null> {
  try {
    const res = await fetch(`${API}/v1/plans`, { next: { revalidate: 300 } });
    return res.ok ? ((await res.json()) as Plans) : null;
  } catch {
    return null;
  }
}

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
const perCents = (c: number) => `$${(c / 100).toFixed(4)}`;

function Tier({ name, price, per, items, cta, featured = false }: { name: string; price: string; per?: string; items: string[]; cta: React.ReactNode; featured?: boolean }) {
  return (
    <div className={`rounded-2xl border p-6 flex flex-col ${featured ? 'border-indigo-500/50 bg-white/[0.04]' : 'border-white/10 bg-white/[0.02]'}`}>
      <h2 className="text-xl font-semibold text-white">{name}</h2>
      <p className="mt-3 text-4xl font-bold text-white">
        {price}
        <span className="text-base font-normal text-slate-400">{price === 'Custom' ? '' : ' / month'}</span>
      </p>
      {per && <p className="mt-1 text-base text-slate-300">{per}</p>}
      <ul className="mt-5 space-y-2 text-base text-slate-200 flex-1">
        {items.map((i) => (
          <li key={i} className="flex gap-2">
            <Check className="w-5 h-5 mt-0.5 shrink-0 text-indigo-400" aria-hidden />
            {i}
          </li>
        ))}
      </ul>
      <div className="mt-6">{cta}</div>
    </div>
  );
}

export default async function PricingPage() {
  const p = await loadPlans();
  const btn = 'block text-center rounded-lg px-4 py-3 text-base font-semibold';
  return (
    <TrustShell wide title="Pricing" subtitle="Public prices, no sales call needed to know what you will pay. Start free in the sandbox; pay only when you go live.">
      {!p ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-base text-amber-100">
          Live prices are temporarily unavailable. Email{' '}
          <a className="underline" href="mailto:sales@sankofaapp.com">sales@sankofaapp.com</a> and we will send them straight away.
        </div>
      ) : (
        <>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <Tier
              name="Free"
              price="$0"
              per={`${p.free.monthly_limit} verifications a month`}
              items={['Sandbox for testing', 'Phone checks on live keys', 'No card needed', 'ID and face checks need a paid plan']}
              cta={<Link href="/register" className={`${btn} border border-white/20 text-white hover:bg-white/5`}>Start free</Link>}
            />
            {p.plans.map((pl) => (
              <Tier
                key={pl.id}
                featured={pl.id === 'growth'}
                name={pl.label}
                price={usd(pl.price_monthly_cents)}
                per={`${pl.monthly_limit.toLocaleString()} verifications · ${perCents(pl.cents_per_verification)} each`}
                items={[
                  `${pl.monthly_limit.toLocaleString()} verifications a month`,
                  `Extra at ${usd(p.overage_cents_per_verification)} each`,
                  'Sandbox for testing',
                ]}
                cta={<Link href="/register" className={`${btn} bg-indigo-500 text-ink hover:bg-indigo-400`}>Choose {pl.label}</Link>}
              />
            ))}
            <Tier
              name="Enterprise"
              price="Custom"
              per="Volume pricing and your own terms"
              items={['Custom pricing', 'Custom SLA', 'Dedicated support']}
              cta={<a href={`mailto:${p.enterprise.contact}`} className={`${btn} border border-white/20 text-white hover:bg-white/5`}>Talk to sales</a>}
            />
          </div>
          <section className="space-y-3 text-base leading-relaxed">
            <h2 className="text-xl font-semibold text-white">How billing works</h2>
            <ul className="list-disc pl-6 space-y-2 text-slate-200">
              {unitsLine(p.units)}
              <li>Prices are in {p.currency}. Past your limit you keep working and pay {usd(p.overage_cents_per_verification)} per extra verification, invoiced after the month.</li>
              {p.local_currencies && p.local_currencies.length > 0 && (
                <li>
                  You can pay in {p.local_currencies.join(', ')} as well as US dollars.{' '}
                  {p.local_currencies.map((c) => `${c}: ${p.plans.map((pl) => `${pl.label} ${((pl.local_prices?.[c] ?? 0) / 100).toLocaleString('en', { maximumFractionDigits: 0 })}`).join(', ')}`).join('. ')}.
                  {' '}The price is fixed when you start checkout, and the amount shown is the amount charged.
                </li>
              )}
              {p.registry_checks && (
                <li>
                  Checking an ID against a government registry costs us a fee from our identity provider, so it is charged at our cost plus a small margin, from prepaid credit you top up ({usd(p.registry_checks.topup_usd.min * 100)} to {usd(p.registry_checks.topup_usd.max * 100)} at a time). A check that does not run is refunded.{' '}
                  {p.registry_checks.fees.length > 0
                    ? <>Per check: {p.registry_checks.fees.map((f) => `${f.scope === '*' ? 'all other countries' : f.scope.replace(':', ' ')} ${(f.cents / 100).toLocaleString('en', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })}`).join(', ')}.</>
                    : 'Registry checks are not switched on yet, so there is no per-check price to show.'}
                </li>
              )}
              <li>The limit is per API key. If you stay under it, you never pay overage.</li>
              <li>These numbers come straight from the system that bills you, so this page cannot drift from your invoice.</li>
            </ul>
            <p className="text-slate-300">
              Questions about volume or invoicing? <a className="underline" href="mailto:sales@sankofaapp.com">sales@sankofaapp.com</a>. Details of every endpoint are in the{' '}
              <Link className="underline" href="/docs">docs</Link>.
            </p>
          </section>
        </>
      )}
    </TrustShell>
  );
}
