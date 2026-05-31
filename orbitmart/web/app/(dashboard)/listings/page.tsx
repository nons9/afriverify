'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import Image from 'next/image';
import { api } from '@/lib/api';

interface Product {
  id: string; title: string; price: number; stock: number; status: string;
  images: { url: string; is_primary: boolean }[];
  created_at: string;
}

const KOBO = (n: number) => `₦${(n / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;
const STATUS_COLORS: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  draft:    'bg-gray-100 text-gray-600',
  paused:   'bg-yellow-100 text-yellow-700',
  sold_out: 'bg-red-100 text-red-600',
  removed:  'bg-red-100 text-red-600',
};

export default function ListingsPage() {
  const { getToken } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    getToken().then(token => {
      if (!token) return;
      api.getAuth<{ products: Product[] }>('/v1/sellers/me/products', token)
        .then(d => setProducts(d.products))
        .finally(() => setLoading(false));
    });
  }, [getToken]);

  const publish = async (id: string) => {
    const token = await getToken();
    await api.patchAuth(`/v1/products/${id}/publish`, {}, token!);
    setProducts(ps => ps.map(p => p.id === id ? { ...p, status: 'active' } : p));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Listings</h1>
        <Link href="/sell" className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-600">+ New Listing</Link>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />)}</div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-4xl mb-3">📦</div>
          <p className="font-medium">No listings yet</p>
          <p className="text-sm mt-1">Create your first listing to start selling.</p>
          <Link href="/sell" className="inline-block mt-4 bg-brand-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-600">Create Listing</Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {products.map((p, idx) => {
            const img = p.images.find(i => i.is_primary) ?? p.images[0];
            return (
              <div key={p.id} className={`flex items-center gap-4 p-4 ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
                <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                  {img && <Image src={img.url} alt={p.title} fill className="object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{p.title}</p>
                  <p className="text-sm text-gray-500">{KOBO(p.price)} · {p.stock} in stock</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                <div className="flex gap-2">
                  {p.status === 'draft' && (
                    <button onClick={() => publish(p.id)} className="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg hover:bg-brand-600">Publish</button>
                  )}
                  <Link href={`/products/${p.id}`} className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">View</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
