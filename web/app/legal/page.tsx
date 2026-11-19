import type { Metadata } from 'next';
import Link from 'next/link';
import { TrustShell } from '@/components/trust-shell';
import { LEGAL_DOCS, LEGAL_VERSION, LEGAL_EFFECTIVE, longDate, inForce } from '@/lib/legal';

export const revalidate = 3600;
export const metadata: Metadata = {
  title: 'Legal - AfriVerify',
  description: 'Every legal document that governs AfriVerify, in one place.',
};

export default function LegalHub() {
  const live = inForce();
  return (
    <TrustShell title="Legal" subtitle="Everything that governs AfriVerify, written to match how the product actually works.">
      <p className="text-base text-slate-400 -mt-4">
        Version {LEGAL_VERSION}. {live ? 'In force since' : 'Takes effect on'} {longDate(LEGAL_EFFECTIVE)}. Sankofa Network, business name registration BN 9753279, Akwa Ibom State, Nigeria.
      </p>
      <ul className="grid gap-4 sm:grid-cols-2">
        {LEGAL_DOCS.map((d) => (
          <li key={d.slug} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <Link href={d.path} className="text-lg font-semibold text-white underline">{d.title}</Link>
            <p className="mt-2 text-base text-slate-300 leading-relaxed">{d.subtitle}</p>
          </li>
        ))}
        <li className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <Link href="/security" className="text-lg font-semibold text-white underline">Security</Link>
          <p className="mt-2 text-base text-slate-300 leading-relaxed">What protects data today, what is not in place yet, how to report a vulnerability, and our sub-processors.</p>
        </li>
      </ul>
      <section className="space-y-2 text-base text-slate-300 leading-relaxed">
        <h2 className="text-xl font-semibold text-white">How these fit together</h2>
        <p>The Terms of Service are the main agreement and include the description of the services and the fees. The Data Processing Agreement, Acceptable Use Policy and Service Levels are part of it. The Privacy Notice and the Biometric and Liveness Notice are for the people being verified. The Research terms apply to anyone taking part in an accuracy study.</p>
      </section>
    </TrustShell>
  );
}
