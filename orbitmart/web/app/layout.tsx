import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: 'OrbitMart — Africa\'s Escrow Marketplace',
  description: 'Buy and sell safely across Africa. Every transaction protected by escrow.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="bg-white text-gray-900 antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
