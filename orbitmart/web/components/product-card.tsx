import Link from 'next/link';
import Image from 'next/image';

interface Props {
  product: {
    id: string;
    title: string;
    price: number;
    condition: string;
    images: { url: string; is_primary: boolean }[];
    seller: { shop_name: string; is_verified: boolean; rating: number };
  };
}

const KOBO = (n: number) => `₦${(n / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

export default function ProductCard({ product }: Props) {
  const img = product.images.find(i => i.is_primary) ?? product.images[0];
  return (
    <Link href={`/products/${product.id}`}
      className="bg-white rounded-xl border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all overflow-hidden group">
      <div className="relative aspect-square bg-gray-100">
        {img ? (
          <Image src={img.url} alt={product.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">📷</div>
        )}
        <div className="absolute top-2 left-2">
          <span className="bg-white/90 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium">{product.condition === 'new' ? 'New' : product.condition.replace('_', ' ')}</span>
        </div>
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug mb-1">{product.title}</p>
        <p className="text-base font-bold text-brand-500">{KOBO(product.price)}</p>
        <div className="flex items-center gap-1 mt-1.5">
          <span className="text-xs text-gray-400 truncate">{product.seller.shop_name}</span>
          {product.seller.is_verified && <span className="text-teal-500 text-xs">✓</span>}
        </div>
      </div>
    </Link>
  );
}
