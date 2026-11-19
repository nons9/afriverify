import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://afriverify.sankofaapp.com'),
  title: "AfriVerify - Identity Infrastructure for Africa",
  description:
    'Verify African identities with a single API call. ID checks in 29 countries, portable Verified Identity Token.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: 'https://afriverify.sankofaapp.com',
    siteName: 'AfriVerify',
    title: "AfriVerify - Identity Infrastructure for Africa",
    description:
      'Verify African identities with a single API call. ID checks in 29 countries, portable Verified Identity Token.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'AfriVerify: verify once, trusted everywhere' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "AfriVerify - Identity Infrastructure for Africa",
    description: 'Verify once. Trusted everywhere.',
    images: ['/og-image.png'],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AfriVerify',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0D0B08',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  viewportFit: 'cover',
};

// Self-hosted at build time: no request to Google when someone opens a page, no render-blocking @import.
const inter = Inter({ subsets: ['latin', 'latin-ext'], display: 'swap', variable: '--font-inter', axes: ['opsz'] });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
