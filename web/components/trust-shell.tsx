import Link from 'next/link';
import { AfriVerifyLogo } from '@/components/logo';
import { Copyright } from '@/components/copyright';

export const TRUST_LINKS = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/security', label: 'Security' },
  { href: '/status', label: 'Status' },
  { href: '/changelog', label: 'Changelog' },
  { href: '/docs', label: 'Docs' },
];

/** Shared frame for the public trust pages: header, readable column, footer with every trust link. */
export function TrustShell({ title, subtitle, children, wide = false }: { title: string; subtitle?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <AfriVerifyLogo size={26} />
          <nav aria-label="Primary" className="flex flex-wrap items-center gap-x-5 gap-y-1 text-base">
            {TRUST_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-slate-300 hover:text-white transition-colors">{l.label}</Link>
            ))}
          </nav>
        </div>
      </header>
      <main className={`${wide ? 'max-w-5xl' : 'max-w-3xl'} mx-auto px-6 py-14`}>
        <h1 className="text-3xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-lg text-slate-300 mt-3 leading-relaxed">{subtitle}</p>}
        <div className="mt-10 space-y-12">{children}</div>
      </main>
      <footer className="border-t border-white/10 px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-base">
          <Copyright className="text-slate-400" />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-1">
            {[...TRUST_LINKS, { href: '/privacy', label: 'Privacy' }, { href: '/terms', label: 'Terms' }].map((l) => (
              <Link key={l.href} href={l.href} className="text-slate-300 hover:text-white transition-colors">{l.label}</Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
