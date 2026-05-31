'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import ProductCard from '@/components/product-card';

interface Category { id: string; name: string; slug: string; icon: string | null; }
interface Product  { id: string; title: string; price: number; images: { url: string; is_primary: boolean }[]; seller: { shop_name: string; is_verified: boolean; rating: number }; condition: string; }

export default function HomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products,   setProducts]   = useState<Product[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [user,       setUser]       = useState<{ full_name: string; role: string } | null>(null);

  useEffect(() => {
    setUser(getUser());
    Promise.all([
      api.get<{ categories: Category[] }>('/v1/categories'),
      api.get<{ products: Product[] }>('/v1/products?limit=12'),
    ]).then(([c, p]) => {
      setCategories(c.categories);
      setProducts(p.products);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-brand-500">OrbitMart</Link>
          <div className="flex-1 mx-8 hidden md:block">
            <input type="search" placeholder="Search products..."
              className="w-full max-w-xl border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              onKeyDown={e => { if (e.key === 'Enter') { const q = (e.target as HTMLInputElement).value; if (q) window.location.href = `/products?q=${encodeURIComponent(q)}`; } }} />
          </div>
          <div className="flex items-center gap-3">
            <Link href="/sell" className="text-sm text-gray-600 hover:text-brand-500 font-medium">Sell</Link>
            {user ? (
              <Link href="/dashboard" className="text-sm bg-brand-500 text-white px-4 py-2 rounded-lg hover:bg-brand-600 font-medium">Dashboard</Link>
            ) : (
              <Link href="/login" className="text-sm bg-brand-500 text-white px-4 py-2 rounded-lg hover:bg-brand-600 font-medium">Sign in</Link>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-500 to-orange-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-1 text-sm mb-4">
            <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
            Escrow-protected payments
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">Africa&apos;s Safest Marketplace</h1>
          <p className="text-lg text-orange-100 mb-8 max-w-xl mx-auto">Buy and sell with confidence. Funds held in escrow until you confirm delivery — zero fraud risk.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/products" className="bg-white text-brand-600 px-6 py-3 rounded-lg font-semibold hover:bg-orange-50">Browse Products</Link>
            <Link href="/sell" className="border border-white text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10">Start Selling</Link>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h2 className="text-xl font-bold text-gray-800 mb-5">Shop by Category</h2>
        {loading ? (
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
            {Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
            {categories.map(cat => (
              <Link key={cat.id} href={`/products?category=${cat.slug}`}
                className="flex flex-col items-center gap-1 p-3 bg-white rounded-xl border border-gray-100 hover:border-brand-300 hover:shadow-sm transition-all">
                <span className="text-2xl">{cat.icon}</span>
                <span className="text-xs text-gray-600 text-center font-medium leading-tight">{cat.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Products */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-16">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-gray-800">Latest Listings</h2>
          <Link href="/products" className="text-sm text-brand-500 font-medium hover:underline">View all</Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-64 bg-gray-200 rounded-xl animate-pulse" />)}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No products yet. Be the first to list!</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>

      {/* Trust bar */}
      <div className="bg-teal-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          {[['🔒', 'Escrow Protection', 'Funds locked until buyer confirms receipt'],
            ['✅', 'Identity Verified', 'All sellers KYC-verified via OrbitVerify'],
            ['⚡', 'Instant Payouts', 'Sellers paid within 24h of confirmation']].map(([icon, title, desc]) => (
            <div key={title as string}>
              <div className="text-3xl mb-1">{icon}</div>
              <div className="font-semibold">{title}</div>
              <div className="text-sm text-teal-100">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
