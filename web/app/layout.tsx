import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "VerifyAfrica — Africa's Identity Infrastructure",
  description:
    'Verify African identities with a single API call. 54 countries, sub-100ms checks, portable Verified Identity Token.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
