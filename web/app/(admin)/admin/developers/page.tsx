'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Users, Search, Loader2, ChevronRight, CheckCircle, XCircle } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';

interface Developer {
  id: string;
  email: string;
  full_name: string;
  company_name: string;
  is_verified: boolean;
  created_at: string;
  plan: string | null;
  sub_status: string | null;
  key_count: string;
  verifications_this_month: string;
  total_verifications: string;
}

const planColour = (plan: string | null) => {
  if (!plan || plan === 'free') return 'text-slate-400 bg-white/5 border-white/10';
  if (plan === 'starter') return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
  if (plan === 'growth') return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
  if (plan === 'enterprise') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  return 'text-slate-400 bg-white/5 border-white/10';
};

export default function AdminDevelopersPage() {
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE = 25;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(PAGE),
      offset: String(page * PAGE),
      ...(search ? { search } : {}),
      ...(plan ? { plan } : {}),
    });
    adminApi.get<{ developers: Developer[]; total: number }>(`/v1/admin/developers?${params}`)
      .then((res) => { setDevelopers(res.developers); setTotal(res.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, plan, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Users className="w-5 h-5 text-rose-400" />
            <h1 className="text-2xl font-bold text-white">Developers</h1>
          </div>
          <p className="text-slate-400 text-sm">{total.toLocaleString()} registered accounts</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search email, company, name…"
            className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-600 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50"
          />
        </div>
        <select
          value={plan}
          onChange={(e) => { setPlan(e.target.value); setPage(0); }}
          className="bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">All plans</option>
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="growth">Growth</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-rose-400 animate-spin" /></div>
      ) : (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-white/5">
                <th className="px-4 py-3 text-left font-medium">Developer</th>
                <th className="px-4 py-3 text-left font-medium">Plan</th>
                <th className="px-4 py-3 text-right font-medium">Keys</th>
                <th className="px-4 py-3 text-right font-medium">Verifs / month</th>
                <th className="px-4 py-3 text-right font-medium">Total verifs</th>
                <th className="px-4 py-3 text-left font-medium">Joined</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {developers.map((dev) => (
                <tr key={dev.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {dev.is_verified
                        ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        : <XCircle className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      }
                      <div>
                        <div className="text-white font-medium">{dev.company_name || dev.full_name}</div>
                        <div className="text-xs text-slate-500">{dev.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full border ${planColour(dev.plan)}`}>
                      {dev.plan ?? 'free'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300">{dev.key_count}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{parseInt(dev.verifications_this_month, 10).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{parseInt(dev.total_verifications, 10).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {new Date(dev.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/developers/${encodeURIComponent(dev.email)}`}
                      className="text-slate-500 hover:text-white transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {developers.length === 0 && (
            <div className="py-12 text-center text-slate-500 text-sm">No developers found.</div>
          )}
        </div>
      )}

      {/* Pagination */}
      {total > PAGE && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
          <span>Showing {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} of {total}</span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-colors"
            >
              Previous
            </button>
            <button
              disabled={(page + 1) * PAGE >= total}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
