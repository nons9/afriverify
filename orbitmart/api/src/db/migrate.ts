import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const { rows } = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [file]
    );
    if (rows.length > 0) continue;

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await pool.query('COMMIT');
      console.log(`Applied: ${file}`);
    } catch (err) {
      await pool.query('ROLLBACK');
      console.error(`Failed: ${file}`, err);
      process.exit(1);
    }
  }

  await pool.end();
  console.log('Migrations complete.');
}

migrate().catch(err => { console.error(err); process.exit(1); });
