import fs from 'fs';
import path from 'path';
import pool from './index';
import logger from '../utils/logger';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    VARCHAR(100) PRIMARY KEY,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await client.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    const executed = new Set(rows.map((r) => r.version));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = file.replace('.sql', '');
      if (executed.has(version)) {
        logger.info(`Skip: ${version}`);
        continue;
      }

      logger.info(`Running: ${version}`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [version]
        );
        await client.query('COMMIT');
        logger.info(`Done: ${version}`);
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`Failed: ${version}`, { error: (err as Error).message });
        throw err;
      }
    }

    logger.info('All migrations complete');
  } finally {
    client.release();
    await pool.end();
  }
}

async function migrateWithRetry(maxAttempts = 5, delayMs = 4000): Promise<void> {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await migrate();
      return;
    } catch (err) {
      if (i === maxAttempts) throw err;
      logger.warn(`Migration attempt ${i}/${maxAttempts} failed, retrying in ${delayMs / 1000}s`, {
        error: (err as Error).message
      });
      await new Promise<void>((r) => setTimeout(r, delayMs));
    }
  }
}

migrateWithRetry().catch((err: Error) => {
  logger.error('Migration runner failed after all retries', { error: err.message });
  process.exit(1);
});
