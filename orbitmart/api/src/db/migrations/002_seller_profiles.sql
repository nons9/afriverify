CREATE TABLE IF NOT EXISTS seller_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_name       TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  description     TEXT,
  logo_url        TEXT,
  banner_url      TEXT,
  kyc_level       SMALLINT NOT NULL DEFAULT 0 CHECK (kyc_level BETWEEN 0 AND 3),
  is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  total_sales     INTEGER NOT NULL DEFAULT 0,
  total_revenue   BIGINT NOT NULL DEFAULT 0,
  rating          NUMERIC(3,2) NOT NULL DEFAULT 0.00,
  review_count    INTEGER NOT NULL DEFAULT 0,
  bank_code       TEXT,
  bank_account    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_profiles_user_id ON seller_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_seller_profiles_slug ON seller_profiles(slug);
