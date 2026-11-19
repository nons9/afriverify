import Link from 'next/link';
import { TrustShell } from '@/components/trust-shell';
import { LegalMarkdown } from '@/components/legal-markdown';
import { LEGAL_DOCS, LEGAL_VERSION, LEGAL_EFFECTIVE, longDate, inForce, type LegalDoc } from '@/lib/legal';

/** One legal document in the shared trust frame, with the version line, the notice-period banner and links to the others. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const live = inForce();
  const hasPrevious = doc.slug === 'terms' || doc.slug === 'privacy';
  return (
    <TrustShell title={doc.title} subtitle={doc.subtitle}>
      <div className="-mt-4 space-y-4">
        <p className="text-base text-slate-400">
          Version {LEGAL_VERSION}. {live ? 'In force since' : 'Takes effect on'} {longDate(LEGAL_EFFECTIVE)}.
        </p>
        {!live && (
          <div role="note" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-base text-amber-100">
            These terms replace the earlier ones on {longDate(LEGAL_EFFECTIVE)}, 30 days after publication, so account holders have time to read them. Until then the terms in force when you signed up still apply
            {hasPrevious && (<>: <Link className="underline" href={`/legal/archive/${doc.slug}`}>read the earlier {doc.slug === 'terms' ? 'Terms' : 'Privacy Policy'}</Link></>)}.
          </div>
        )}
        <nav aria-label="Legal documents" className="flex flex-wrap gap-x-5 gap-y-2 text-base">
          {LEGAL_DOCS.map((d) => (
            <Link key={d.slug} href={d.path} aria-current={d.slug === doc.slug ? 'page' : undefined} className={d.slug === doc.slug ? 'text-white font-semibold underline' : 'text-slate-300 hover:text-white'}>{d.short}</Link>
          ))}
          <Link href="/security" className="text-slate-300 hover:text-white">Security</Link>
        </nav>
      </div>
      <LegalMarkdown source={doc.body} />
      <p className="text-base text-slate-400 border-t border-white/10 pt-6">
        Questions: <a className="underline" href="mailto:legal@sankofaapp.com">legal@sankofaapp.com</a> for contracts, <a className="underline" href="mailto:privacy@sankofaapp.com">privacy@sankofaapp.com</a> for data protection, <a className="underline" href="mailto:security@sankofaapp.com">security@sankofaapp.com</a> for security. Sankofa Network, business name registration BN 9753279, Akwa Ibom State, Nigeria.
      </p>
    </TrustShell>
  );
}
