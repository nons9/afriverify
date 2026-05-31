export interface UserRow {
  id: string;
  clerk_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  role: 'buyer' | 'seller' | 'admin';
  orbit_vit: string | null;
  trust_score: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // joined from seller_profiles
  seller_profile_id?: string;
  shop_name?: string;
  kyc_level?: number;
}

export interface SellerProfileRow {
  id: string;
  user_id: string;
  shop_name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  kyc_level: number;
  is_verified: boolean;
  total_sales: number;
  total_revenue: number;
  rating: number;
  review_count: number;
  bank_code: string | null;
  bank_account: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductRow {
  id: string;
  seller_id: string;
  category_id: string;
  title: string;
  slug: string;
  description: string;
  price: number;
  compare_price: number | null;
  stock: number;
  condition: 'new' | 'like_new' | 'good' | 'fair' | 'poor';
  status: 'draft' | 'active' | 'paused' | 'sold_out' | 'removed';
  location: string | null;
  tags: string[];
  view_count: number;
  created_at: string;
  updated_at: string;
  // joined
  images?: ProductImageRow[];
  seller?: Pick<SellerProfileRow, 'id' | 'shop_name' | 'slug' | 'is_verified' | 'rating'>;
}

export interface ProductImageRow {
  id: string;
  product_id: string;
  url: string;
  alt: string | null;
  sort_order: number;
  is_primary: boolean;
}

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface AddressRow {
  id: string;
  user_id: string;
  label: string;
  full_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  country: string;
  postal_code: string | null;
  is_default: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserRow;
    }
  }
}
