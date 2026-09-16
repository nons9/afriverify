'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Users, Fingerprint,
  Ban, BarChart2, Activity, Key, LogOut, UserCog, Menu, X, Zap,
} from 'lucide-react';
import { getAdminSession, clearAdminSession, AdminUser } from '@/lib/admin-auth';
import { AfriVerifyMark } from '@/components/logo';

const nav = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/developers', label: 'Developers', icon: Users },
  { href: '/admin/identities', label: 'Identities', icon: Fingerprint },
  { href: '/admin/blacklist', label: 'Blacklist', icon: Ban },
  { href: '/admin/api-keys', label: 'API Keys', icon: Key },
  { href: '/admin/revenue', label: 'Revenue', icon: BarChart2 },
  { href: '/admin/health', label: 'System Health', icon: Activity },
  { href: '/admin/risk-rules', label: 'Risk Rules', icon: Zap },
  { href: '/admin/users', label: 'Admin Users', icon: UserCog },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (isLoginPage) return;
    const session = getAdminSession();
    if (!session) {
      router.replace('/admin/login');
    } else {
      setAdmin(session.admin);
    }
  }, [router, isLoginPage]);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  function handleLogout() {
    clearAdminSession();
    router.push('/admin/login');
  }

  if (isLoginPage) return <>{children}</>;

  if (!admin) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const SidebarContent = () => (
    <>
      <div className="h-14 flex items-center px-4 border-b border-white/10">
        <Link href="/admin" className="flex items-center gap-2 shrink-0">
          <AfriVerifyMark size={26} />
          <div>
            <span className="font-bricolage font-extrabold text-[#C9960E] text-sm leading-none">Verify</span>
            <span className="ml-1.5 text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded px-1 py-px">ADMIN</span>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {nav.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href) && href !== '/admin';
          const isExactActive = href === '/admin' && pathname === '/admin';
          const isActive = isExactActive || (!exact && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-rose-500/10 text-rose-400'
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
          <div className="w-7 h-7 rounded-full bg-rose-500/20 flex items-center justify-center text-xs font-bold text-rose-400">
            {admin.full_name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">{admin.full_name}</div>
            <div className="text-xs text-slate-500 truncate capitalize">{admin.role.replace('_', ' ')}</div>
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
    </>
  );

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 w-56 bg-zinc-900 border-r border-white/10 flex flex-col transform transition-transform duration-200 md:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent />
      </aside>

      <aside className="hidden md:flex w-56 shrink-0 bg-zinc-900 border-r border-white/10 flex-col">
        <SidebarContent />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex items-center px-4 gap-3 bg-zinc-900 border-b border-white/10 md:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-400 hover:text-white transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <AfriVerifyMark size={22} />
            <span className="font-bricolage font-extrabold text-[#C9960E] text-sm">Verify</span>
            <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded px-1 py-px">ADMIN</span>
          </div>
          {sidebarOpen && (
            <button onClick={() => setSidebarOpen(false)} className="ml-auto text-slate-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </header>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
