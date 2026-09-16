-- Fix admin password hash for nonsonelch@gmail.com
-- Password: Av471e0e318002f3843179
-- Hash generated with: crypto.scryptSync(password, salt, 64)
UPDATE admin_users
SET password_hash = '843a0443010e4b7741b934057a090097:999ce7d768e90000f59035c2f0608b75d8d1387387bf94192cd7e7e7fa68a780cec9bbe02dccd4b922916ce93ba6f9bea2df81b1a60923a87cc2ec379f48e39f',
    is_active = true,
    role = 'super_admin'
WHERE email = 'nonsonelch@gmail.com';

-- If the row doesn't exist yet (040 migration may not have run), insert it
INSERT INTO admin_users (email, full_name, role, password_hash, is_active)
VALUES (
  'nonsonelch@gmail.com',
  'Nonsonelch Admin',
  'super_admin',
  '843a0443010e4b7741b934057a090097:999ce7d768e90000f59035c2f0608b75d8d1387387bf94192cd7e7e7fa68a780cec9bbe02dccd4b922916ce93ba6f9bea2df81b1a60923a87cc2ec379f48e39f',
  true
)
ON CONFLICT (email) DO NOTHING;
