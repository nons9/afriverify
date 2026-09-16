'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Fingerprint, Search, Loader2, ChevronRight, AlertOctagon } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';

interface Identity {
  id: string;
  phone: string;
  full_name: string;
  verification_level: string;
  trust_score: number;
  aml_status: string;
  is_blacklisted: boolean;
  created_at: string;
  session_count: string;
}

export default function AdminIdentitiesPage() {
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE = 50;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(PAGE),
      offset: String(page * PAGE),
      ...(search ? { search } : {}),
    });
    adminApi.get<{ identities: Identity[] }>(`/v1/admin/identities?${params}`)
      .then((res) => setIdentities(res.identities))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

  const amlColour = (status: string) => {
    if (status === 'clear') return 'text-emerald-400';
    if (status === 'flagged') return 'text-rose-400';
    return 'text-slate-500';
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6 flex items-center gap-3">
        <Fingerprint className="w-5 h-5 text-rose-400" />
        <h1 className="text-2xl font-bold text-white">Identities</h1>
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search by phone, name, or ID…"
          className="w-full max-w-sm bg-white/5 border border-white/10 text-white placeholder-slate-600 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-rose-400 animate-spin" /></div>
      ) : (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-white/5">
                <th className="px-4 py-3 text-left font-medium">Identity</th>
                <th className="px-4 py-3 text-left font-medium">Level</th>
                <th className="px-4 py-3 text-right font-medium">Trust</th>
                <th className="px-4 py-3 text-left font-medium">AML</th>
                <th className="px-4 py-3 text-right font-medium">Sessions</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {identities.map((id) => (
                <tr key={id.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {id.is_blacklisted && <AlertOctagon className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                      <div>
                        <div className="text-white font-medium">{id.full_name || '-'}</div>
                        <div className="text-xs text-slate-500">{id.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400 capitalize">{id.verification_level}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-medium ${id.trust_score >= 70 ? 'text-emerald-400' : id.trust_score >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>
                      {id.trust_score}
                    </span>
                  </td>
                  <td className={`px-4 py-3 capitalize ${amlColour(id.aml_status)}`}>{id.aml_status || '-'}</td>
                  <td className="px-4 py-3 text-right text-slate-400">{id.session_count}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(id.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/identities/${id.id}`} className="text-slate-500 hover:text-white transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {identities.length === 0 && (
            <div className="py-12 text-center text-slate-500 text-sm">No identities found.</div>
          )}
        </div>
      )}

      {identities.length === PAGE && (
        <div className="flex justify-end mt-4 gap-2 text-sm text-slate-500">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-colors">Previous</button>
          <button onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">Next</button>
        </div>
      )}
    </div>
  );
}
