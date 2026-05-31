'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { api } from '@/lib/api';

interface Product {
  id: string; title: string; price: number; compare_price: number | null;
  description: string; condition: string; location: string | null; tags: string[];
  images: { url: string; alt: string | null; is_primary: boolean }[];
  seller: { id: string; shop_name: string; slug: string; is_verified: boolean; rating: number };
  stock: number; view_count: number; created_at: string;
}

const KOBO = (n: number) => `₦${(n / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;
const CONDITION_LABEL: Record<string, string> = { new: 'New', like_new: 'Like New', good: 'Good', fair: 'Fair', poor: 'Poor' };

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [imgIdx,  setImgIdx]  = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ product: Product }>(`/v1/products/${id}`)
      .then(d => { setProduct(d.product); setImgIdx(d.product.images.findIndex(i => i.is_primary) || 0); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-brand-400 border-t-transparent rounded-full animate-spin" /></div>;
  if (!product) return <div className="min-h-screen flex items-center justify-center text-gray-400">Product not found.</div>;

  const activeImage = product.images[imgIdx]?.url ?? '/placeholder.png';

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" className="text-lg font-bold text-brand-500">OrbitMart</Link>
          <span className="text-gray-300">/</span>
          <Link href="/products" className="text-sm text-gray-500 hover:text-brand-500">Products</Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-700 truncate max-w-xs">{product.title}</span>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Images */}
          <div>
            <div className="relative aspect-square bg-white rounded-2xl overflow-hidden border border-gray-100">
              <Image src={activeImage} alt={product.title} fill className="object-cover" />
            </div>
            {product.images.length > 1 && (
              <div className="flex gap-2 mt-3">
                {product.images.map((img, i) => (
                  <button key={i} onClick={() => setImgIdx(i)}
                    className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 ${i === imgIdx ? 'border-brand-400' : 'border-gray-200'}`}>
                    <Image src={img.url} alt={img.alt ?? ''} fill className="object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{product.title}</h1>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-3xl font-bold text-brand-500">{KOBO(product.price)}</span>
              {product.compare_price && (
                <span className="text-lg text-gray-400 line-through">{KOBO(product.compare_price)}</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              <span className="bg-gray-100 text-gray-600 text-sm px-3 py-1 rounded-full">{CONDITION_LABEL[product.condition] ?? product.condition}</span>
              {product.location && <span className="bg-gray-100 text-gray-600 text-sm px-3 py-1 rounded-full">📍 {product.location}</span>}
              <span className={`text-sm px-3 py-1 rounded-full font-medium ${product.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}</span>
            </div>

            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 text-teal-700 font-semibold mb-1"><span>🔒</span> Escrow Protected</div>
              <p className="text-sm text-teal-600">Your payment is held securely until you confirm delivery. Full refund if the item doesn't arrive.</p>
            </div>

            <button disabled={product.stock === 0}
              className="w-full bg-brand-500 text-white py-3.5 rounded-xl font-semibold text-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mb-3">
              {product.stock > 0 ? 'Buy Now (Escrow)' : 'Out of Stock'}
            </button>
            <button className="w-full border border-brand-400 text-brand-500 py-3 rounded-xl font-semibold hover:bg-brand-50 transition-colors">
              Add to Watchlist
            </button>

            {/* Seller */}
            <Link href={`/sellers/${product.seller.slug}`} className="flex items-center gap-3 mt-6 p-4 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition-colors">
              <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center font-bold text-brand-600">{product.seller.shop_name[0]}</div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 font-semibold text-gray-800">
                  {product.seller.shop_name}
                  {product.seller.is_verified && <span className="text-teal-500 text-xs">✓ Verified</span>}
                </div>
                <div className="text-sm text-gray-500">⭐ {Number(product.seller.rating).toFixed(1)} · View shop</div>
              </div>
              <span className="text-gray-400">›</span>
            </Link>

            {product.description && (
              <div className="mt-6">
                <h3 className="font-semibold text-gray-700 mb-2">Description</h3>
                <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{product.description}</p>
              </div>
            )}

            {product.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {product.tags.map(tag => <span key={tag} className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">#{tag}</span>)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
