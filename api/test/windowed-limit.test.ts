import test from 'node:test';
import assert from 'node:assert/strict';
import redis from '../src/redis';
import { withinLimit } from '../src/utils/windowed-limit';

const mem = new Map<string, number>(); let down = false;
(redis as any).incr = async (k: string) => { if (down) throw new Error('down'); mem.set(k, (mem.get(k) ?? 0) + 1); return mem.get(k)!; };
(redis as any).expire = async () => 1;

test('allows up to the max inside a window, then refuses', async () => {
  const t = 1_000_000_000_000; mem.clear();
  const r = [] as boolean[];
  for (let i = 0; i < 5; i++) r.push(await withinLimit('s', 'u1', 3, 60, t));
  assert.deepEqual(r, [true, true, true, false, false]);
});
test('a new window starts fresh; other ids and scopes are separate', async () => {
  const t = 1_000_000_000_000; mem.clear();
  for (let i = 0; i < 4; i++) await withinLimit('s', 'u1', 3, 60, t);
  assert.equal(await withinLimit('s', 'u1', 3, 60, t + 61_000), true);
  assert.equal(await withinLimit('s', 'u2', 3, 60, t), true);
  assert.equal(await withinLimit('other', 'u1', 3, 60, t), true);
});
test('fails closed when Redis is unavailable', async () => {
  down = true; try { assert.equal(await withinLimit('s', 'u1', 100, 60), false); } finally { down = false; }
});
