import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { bySlug } from '@/lib/legal';

export const revalidate = 3600;
export const metadata: Metadata = {
  title: 'Privacy Notice - AfriVerify',
  description: 'What happens to your information when you are verified through AfriVerify or use our website and dashboard.',
};

export default function PrivacyPage() {
  return <LegalPage doc={bySlug('privacy')!} />;
}
