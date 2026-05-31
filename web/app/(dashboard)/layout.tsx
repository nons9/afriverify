'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Shield, LayoutDashboard, Key, CheckCircle, BarChart2, LogOut } from 'lucide-react';
import { getSession, clearSession, Developer } from '@/lib/auth';

const nav = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/api-keys', label: 'API Keys', icon: Key },
  { href: '/dashboard/verifications', label: 'Verifications', icon: CheckCircle },
  { href: '/dashboard/usage', label: 'Usage & Billing', icon: BarChart2 },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [developer, setDeveloper] = useState<Developer | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
    } else {
      setDeveloper(session.developer);
    }
  }, [router]);

  function handleLogout() {
    clearSession();
    router.push('/');
  }

  if (!developer) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex">
      <aside className="w-56 shrink-0 bg-slate-900 border-r border-white/10 flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-white/10">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-white text-sm">OrbitVerify</span>
          </Link>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-indigo-500/10 text-indigo-400'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 px-2 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-400">
              {developer.full_name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white truncate">{developer.company_name}</div>
              <div className="text-xs text-slate-500 truncate">{developer.email}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/5 rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
