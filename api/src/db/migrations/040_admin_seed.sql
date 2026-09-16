-- Seed the initial super_admin account.
-- Password is set out-of-band; change it immediately after first login.
INSERT INTO admin_users (email, full_name, role, password_hash, is_active)
VALUES (
  'nonsonelch@gmail.com',
  'Nonsonelch Admin',
  'super_admin',
  '02b62095e84d397c8b41c25dde5d7d39:2a98bba18f92289cf6b8ef870e2b9bb1c4d2f9499d0cf5e897a4196404ca04613dd28bee11912a4853084e190a359d65b4b316bc8c342ebe29f1c7c03462cff7',
  true
)
ON CONFLICT (email) DO UPDATE
  SET role = 'super_admin', is_active = true;
