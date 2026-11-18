import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://afriverify.sankofaapp.com'),
  title: "AfriVerify - Africa's Identity Infrastructure",
  description:
    'Verify African identities with a single API call. 54 countries, sub-100ms checks, portable Verified Identity Token.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: 'https://afriverify.sankofaapp.com',
    siteName: 'AfriVerify',
    title: "AfriVerify - Africa's Identity Infrastructure",
    description:
      'Verify African identities with a single API call. 54 countries, sub-100ms checks, portable Verified Identity Token.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'AfriVerify: verify once, trusted everywhere' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "AfriVerify - Africa's Identity Infrastructure",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300;12..96,800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
