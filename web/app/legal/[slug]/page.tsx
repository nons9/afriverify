import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LegalPage } from '@/components/legal-page';
import { LEGAL_DOCS, bySlug } from '@/lib/legal';

export const revalidate = 3600;
export const dynamicParams = false;

// terms and privacy live at /terms and /privacy; everything else is served here.
const HERE = LEGAL_DOCS.filter((d) => d.slug !== 'terms' && d.slug !== 'privacy');

export function generateStaticParams() {
  return HERE.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = HERE.find((d) => d.slug === slug);
  return doc ? { title: `${doc.title} - AfriVerify`, description: doc.subtitle } : {};
}

export default async function LegalDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = bySlug(slug);
  if (!doc || !HERE.includes(doc)) notFound();
  return <LegalPage doc={doc} />;
}
