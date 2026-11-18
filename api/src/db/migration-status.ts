import fs from 'fs';
import path from 'path';
import { query } from './index';

export interface MigrationStatus {
  expected: number;
  applied: number;
  pending: string[];
  current: boolean;
}

/**
 * Compares the migration files shipped in this build with schema_migrations. Used by the readiness probe so a
 * deploy whose migrations did not apply never becomes the live version (the old one keeps serving).
 */
export async function getMigrationStatus(dir = path.join(__dirname, 'migrations')): Promise<MigrationStatus> {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, '')).sort();
  const rows = await query<{ version: string }>('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.version));
  const pending = files.filter((f) => !applied.has(f));
  return { expected: files.length, applied: files.length - pending.length, pending, current: pending.length === 0 };
}
