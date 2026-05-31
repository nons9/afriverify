'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { clearSession, getToken, getUser } from '@/lib/auth';

const nav = [
  { href: '/dashboard',          label: 'Overview', icon: '📊' },
  { href: '/dashboard/listings', label: 'Listings', icon: '📦' },
  { href: '/dashboard/orders',   label: 'Orders',   icon: '🛒' },
  { href: '/dashboard/earnings', label: 'Earnings', icon: '💰' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();

  useEffect(() => {
    if (!getToken()) router.replace('/login?redirect=' + pathname);
  }, [router, pathname]);

  const user    = getUser();
  const signOut = () => { clearSession(); router.push('/'); };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col pt-6">
        <Link href="/" className="px-5 mb-6 text-lg font-bold text-brand-500">OrbitMart</Link>
        <nav className="flex-1 px-3">
          {nav.map(item => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-colors
                ${pathname === item.href ? 'bg-brand-50 text-brand-600' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
              <span>{item.icon}</span>{item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-100">
          {user && <p className="text-xs text-gray-500 mb-2 truncate">{user.full_name}</p>}
          <button onClick={signOut} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Sign out</button>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
