CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  icon        TEXT,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO categories (name, slug, icon, sort_order) VALUES
  ('Electronics',   'electronics',   '💻', 1),
  ('Fashion',       'fashion',       '👗', 2),
  ('Home & Living', 'home-living',   '🏠', 3),
  ('Food & Drinks', 'food-drinks',   '🍔', 4),
  ('Health',        'health',        '💊', 5),
  ('Sports',        'sports',        '⚽', 6),
  ('Books',         'books',         '📚', 7),
  ('Vehicles',      'vehicles',      '🚗', 8),
  ('Services',      'services',      '🛠️', 9),
  ('Agriculture',   'agriculture',   '🌾', 10)
ON CONFLICT (slug) DO NOTHING;
