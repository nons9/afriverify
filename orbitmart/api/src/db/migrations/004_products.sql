CREATE TYPE product_condition AS ENUM ('new', 'like_new', 'good', 'fair', 'poor');
CREATE TYPE product_status AS ENUM ('draft', 'active', 'paused', 'sold_out', 'removed');

CREATE TABLE IF NOT EXISTS products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id     UUID NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  category_id   UUID NOT NULL REFERENCES categories(id),
  title         TEXT NOT NULL,
  slug          TEXT NOT NULL,
  description   TEXT NOT NULL,
  price         BIGINT NOT NULL CHECK (price > 0),
  compare_price BIGINT,
  stock         INTEGER NOT NULL DEFAULT 1,
  condition     product_condition NOT NULL DEFAULT 'new',
  status        product_status NOT NULL DEFAULT 'draft',
  location      TEXT,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  search_vec    TSVECTOR,
  view_count    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_seller_id   ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status      ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_price       ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_search_vec  ON products USING GIN(search_vec);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_seller_slug ON products(seller_id, slug);

CREATE OR REPLACE FUNCTION products_search_vec_trigger() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vec :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', array_to_string(NEW.tags, ' ')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_search_vec
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION products_search_vec_trigger();
