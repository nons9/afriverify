'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface SellerProfile {
  shop_name: string; total_sales: number; total_revenue: number;
  rating: number; review_count: number; kyc_level: number; is_verified: boolean;
}

const KOBO = (n: number) => `₦${(n / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

export default function DashboardPage() {
  const [seller,  setSeller]  = useState<SellerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth.get<{ seller: SellerProfile }>('/v1/sellers/me')
      .then(d => setSeller(d.seller))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    { label: 'Total Sales', value: seller ? String(seller.total_sales)         : '—', icon: '🛒' },
    { label: 'Revenue',     value: seller ? KOBO(seller.total_revenue)          : '—', icon: '💰' },
    { label: 'Rating',      value: seller ? `${Number(seller.rating).toFixed(1)} ⭐` : '—', icon: '⭐' },
    { label: 'KYC Level',   value: seller ? `Level ${seller.kyc_level}`         : '—', icon: '✅' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {loading ? 'Loading...' : seller ? `${seller.shop_name} — Dashboard` : 'Dashboard'}
        </h1>
        {seller?.is_verified && <span className="text-sm text-teal-600 font-medium">✓ Verified Seller</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(s => (
          <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <div className="text-2xl mb-2">{s.icon}</div>
            <div className="text-2xl font-bold text-gray-900">
              {loading ? <div className="h-7 w-20 bg-gray-200 rounded animate-pulse" /> : s.value}
            </div>
            <div className="text-sm text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {seller && seller.kyc_level < 2 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <div className="font-semibold text-amber-700 mb-1">Complete KYC to unlock higher limits</div>
          <p className="text-sm text-amber-600 mb-3">Verify your identity via VerifyAfrica to increase your payout limits and boost buyer trust.</p>
          <button className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600">Start KYC Verification</button>
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="font-semibold text-gray-700 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[['📦 New Listing', '/dashboard/listings'],
            ['🛒 View Orders',  '/dashboard/orders'],
            ['💰 Earnings',     '/dashboard/earnings']].map(([label, href]) => (
            <a key={href} href={href} className="flex items-center justify-center py-3 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">{label}</a>
          ))}
        </div>
      </div>
    </div>
  );
}
