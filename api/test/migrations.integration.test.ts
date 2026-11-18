// DB-backed: runs the REAL migration chain on a real Postgres. Skipped unless TEST_DATABASE_URL is set.
//   TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/scratch npm test
// This is the test that would have caught migration 044 failing on every deploy.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { Client } from 'pg';

const URL_ = process.env.TEST_DATABASE_URL;
const skip = !URL_ && 'set TEST_DATABASE_URL to a scratch (empty) database to run';
const MIG_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');

function runMigrate(): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ['--require', 'ts-node/register/transpile-only', path.join(__dirname, '..', 'src', 'db', 'migrate.ts')], {
      env: { ...process.env, DATABASE_URL: URL_, NODE_ENV: 'test' }, stdio: 'ignore',
    });
    p.on('exit', (code) => resolve(code ?? 1));
  });
}

test('the full migration chain applies on an empty database; two runners at once; re-running is a no-op', { skip, timeout: 120_000 }, async () => {
  const files = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql'));
  // two replicas starting together must serialise on the advisory lock and BOTH succeed
  const [a, b] = await Promise.all([runMigrate(), runMigrate()]);
  assert.equal(a, 0, 'first concurrent runner exits 0');
  assert.equal(b, 0, 'second concurrent runner exits 0');

  const c = new Client({ connectionString: URL_ });
  await c.connect();
  try {
    const { rows } = await c.query('SELECT count(*)::int AS n FROM schema_migrations');
    assert.equal(rows[0].n, files.length, 'every migration file is recorded exactly once');
  } finally {
    await c.end();
  }
  assert.equal(await runMigrate(), 0, 're-running after completion is idempotent');
});
