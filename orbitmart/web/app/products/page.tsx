'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import ProductCard from '@/components/product-card';

interface Product { id: string; title: string; price: number; images: { url: string; is_primary: boolean }[]; seller: { shop_name: string; is_verified: boolean; rating: number }; condition: string; }
interface Category { id: string; name: string; slug: string; icon: string | null; }

export default function ProductsPage() {
  const params   = useSearchParams();
  const router   = useRouter();
  const [products,   setProducts]   = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);

  const q        = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const sort     = params.get('sort') ?? 'newest';

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q)        qs.set('q', q);
      if (category) qs.set('category', category);
      if (sort)     qs.set('sort', sort);
      qs.set('page', String(page));
      const data = await api.get<{ products: Product[] }>(`/v1/products?${qs}`);
      setProducts(data.products);
    } finally {
      setLoading(false);
    }
  }, [q, category, sort, page]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { api.get<{ categories: Category[] }>('/v1/categories').then(d => setCategories(d.categories)); }, []);

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    next.delete('page');
    router.push(`/products?${next}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/" className="text-lg font-bold text-brand-500">OrbitMart</Link>
          <input
            type="search"
            defaultValue={q}
            placeholder="Search products..."
            className="flex-1 max-w-lg border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            onKeyDown={e => { if (e.key === 'Enter') updateFilter('q', (e.target as HTMLInputElement).value); }}
          />
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex gap-6">
        {/* Sidebar */}
        <aside className="w-56 hidden lg:block shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-700 mb-3 text-sm">Categories</h3>
            <button onClick={() => updateFilter('category', '')} className={`block w-full text-left py-1.5 px-2 rounded text-sm mb-0.5 ${!category ? 'bg-brand-50 text-brand-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>All</button>
            {categories.map(c => (
              <button key={c.id} onClick={() => updateFilter('category', c.slug)}
                className={`block w-full text-left py-1.5 px-2 rounded text-sm mb-0.5 ${category === c.slug ? 'bg-brand-50 text-brand-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                {c.icon} {c.name}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 mt-4">
            <h3 className="font-semibold text-gray-700 mb-3 text-sm">Sort by</h3>
            {[['newest', 'Newest'], ['popular', 'Most Popular'], ['price_asc', 'Price: Low to High'], ['price_desc', 'Price: High to Low']].map(([val, label]) => (
              <button key={val} onClick={() => updateFilter('sort', val)}
                className={`block w-full text-left py-1.5 px-2 rounded text-sm mb-0.5 ${sort === val ? 'bg-brand-50 text-brand-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>
        </aside>

        {/* Grid */}
        <main className="flex-1">
          {q && <p className="text-sm text-gray-500 mb-4">Results for <strong>"{q}"</strong></p>}
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {Array.from({ length: 9 }).map((_, i) => <div key={i} className="h-64 bg-gray-200 rounded-xl animate-pulse" />)}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-20 text-gray-400">No products found.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {products.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
          <div className="flex justify-center gap-3 mt-8">
            {page > 1 && <button onClick={() => setPage(p => p - 1)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-100">Previous</button>}
            {products.length === 20 && <button onClick={() => setPage(p => p + 1)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-100">Next</button>}
          </div>
        </main>
      </div>
    </div>
  );
}
