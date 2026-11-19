import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { bySlug } from '@/lib/legal';

export const revalidate = 3600;
export const metadata: Metadata = {
  title: 'Terms of Service - AfriVerify',
  description: 'The agreement between AfriVerify and its customers, the description of the services, and the fees and billing rules.',
};

export default function TermsPage() {
  return <LegalPage doc={bySlug('terms')!} />;
}
