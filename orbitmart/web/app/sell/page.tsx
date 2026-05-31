'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { api } from '@/lib/api';

interface Category { id: string; name: string; slug: string; icon: string | null; }

export default function SellPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [step,       setStep]       = useState<'profile' | 'listing'>('profile');
  const [hasProfile, setHasProfile] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  const [shopName, setShopName] = useState('');
  const [shopDesc, setShopDesc] = useState('');

  useEffect(() => {
    api.get<{ categories: Category[] }>('/v1/categories').then(d => setCategories(d.categories));
    getToken().then(token => {
      if (!token) return;
      api.getAuth<{ seller?: { id: string } }>('/v1/sellers/me', token)
        .then(() => { setHasProfile(true); setStep('listing'); })
        .catch(() => {});
    });
  }, [getToken]);

  const createProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const token = await getToken();
      await api.postAuth('/v1/sellers', { shop_name: shopName, description: shopDesc }, token!);
      setHasProfile(true); setStep('listing');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create shop');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'profile' && !hasProfile) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Open Your Shop</h1>
        <p className="text-gray-500 mb-6 text-sm">Start selling on OrbitMart in minutes.</p>
        {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}
        <form onSubmit={createProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shop Name</label>
            <input value={shopName} onChange={e => setShopName(e.target.value)} required minLength={2} maxLength={80}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" placeholder="e.g. Ade's Tech Store" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <textarea value={shopDesc} onChange={e => setShopDesc(e.target.value)} rows={3} maxLength={1000}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" placeholder="Tell buyers what you sell..." />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-brand-500 text-white py-3 rounded-lg font-semibold hover:bg-brand-600 disabled:opacity-60">
            {loading ? 'Creating shop...' : 'Create Shop'}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-brand-500">OrbitMart</span>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-gray-500 hover:text-brand-500">My Dashboard</button>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">List a Product</h1>
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-6 text-sm text-teal-700">
          🔒 Your product will be protected by OrbitMart Escrow. Buyers pay into escrow, you ship, funds released on confirmation.
        </div>
        <button onClick={() => router.push('/dashboard/listings/new')}
          className="w-full bg-brand-500 text-white py-4 rounded-xl font-semibold text-lg hover:bg-brand-600">
          Create New Listing
        </button>
      </div>
    </div>
  );
}
