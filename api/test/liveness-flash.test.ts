import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateFlashPlan, buildFlashMeta, livenessMetaSchema, FLASH_PALETTE, FLASH_NEUTRAL, FlashPlan,
} from '../src/services/liveness.service';

const plan = (): FlashPlan => generateFlashPlan();
const goodClient = (p: FlashPlan) => ({
  lead: { start_ms: 0, end_ms: p.lead_ms },
  windows: p.steps.map((_, i) => ({ start_ms: p.lead_ms + i * p.hold_ms, end_ms: p.lead_ms + (i + 1) * p.hold_ms })),
});

test('plan uses every palette colour exactly once, in a random order', () => {
  const orders = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const p = plan();
    assert.equal(p.steps.length, FLASH_PALETTE.length);
    assert.deepEqual([...p.steps.map((c) => c.join(','))].sort(), FLASH_PALETTE.map((c) => c.join(',')).sort());
    orders.add(p.steps.map((c) => c.join(',')).join('|'));
  }
  assert.ok(orders.size > 100, `only ${orders.size} distinct orders in 200 plans`);
});

test('plan is photosensitivity-safe: under 3 changes a second and no fully saturated red', () => {
  const p = plan();
  assert.ok(1000 / p.hold_ms <= 2, 'at most 2 changes per second');
  for (const [r, g, b] of [...FLASH_PALETTE, FLASH_NEUTRAL]) {
    const sum = r + g + b;
    const saturatedRed = r / sum >= 0.8 && (r - g - b) * 320 > 80;   // WCAG 2.3.1 definition
    assert.equal(saturatedRed, false, `rgb(${r},${g},${b}) is saturated red`);
  }
});

test('buildFlashMeta takes colours from the stored plan and windows from the client', () => {
  const p = plan();
  const m = buildFlashMeta(p, goodClient(p));
  assert.ok(m && 'colors' in m);
  assert.deepEqual(m.colors, p.steps);
  assert.equal(m.windows.length, p.steps.length);
});

test('skipped is passed through; nothing from the client means "missing" (undefined)', () => {
  const p = plan();
  assert.deepEqual(buildFlashMeta(p, { skipped: true }), { skipped: true });
  assert.equal(buildFlashMeta(p, undefined), undefined);            // issued, but the client sent nothing
  assert.deepEqual(buildFlashMeta(null, goodClient(p)), { not_issued: true });   // API integration that did not opt in
  assert.deepEqual(buildFlashMeta(null, undefined), { not_issued: true });
});

test('implausible client windows are rejected, not trusted', () => {
  const p = plan();
  const good = goodClient(p);
  // wrong number of windows
  assert.equal(buildFlashMeta(p, { ...good, windows: good.windows.slice(1) }), undefined);
  // one huge window instead of the planned hold
  const huge = structuredClone(good); huge.windows[2].end_ms += 5000;
  assert.equal(buildFlashMeta(p, huge), undefined);
  // a window that is far too short
  const tiny = structuredClone(good); tiny.windows[1].end_ms = tiny.windows[1].start_ms + 50;
  assert.equal(buildFlashMeta(p, tiny), undefined);
  // overlapping the previous step
  const overlap = structuredClone(good); overlap.windows[3].start_ms -= 600; overlap.windows[3].end_ms -= 600;
  assert.equal(buildFlashMeta(p, overlap), undefined);
  // lead window with no length
  assert.equal(buildFlashMeta(p, { ...good, lead: { start_ms: 10, end_ms: 10 } }), undefined);
});

test('meta schema accepts a capture profile and rejects unknown ones', () => {
  const ts = [0, 125, 250];
  assert.ok(livenessMetaSchema.safeParse({ timestamps_ms: ts, profile: 'lite' }).success);
  assert.ok(livenessMetaSchema.safeParse({ timestamps_ms: ts, profile: 'standard' }).success);
  assert.equal(livenessMetaSchema.safeParse({ timestamps_ms: ts, profile: 'turbo' }).success, false);
  assert.equal(livenessMetaSchema.parse({ timestamps_ms: ts }).profile, undefined);        // old clients: no profile
});

test('meta schema accepts old clients, flash windows and skipped; rejects junk', () => {
  const ts = [0, 125, 250];
  assert.ok(livenessMetaSchema.safeParse({ timestamps_ms: ts }).success);                           // old client
  assert.ok(livenessMetaSchema.safeParse({ timestamps_ms: ts, flash: { skipped: true } }).success);
  const p = plan();
  assert.ok(livenessMetaSchema.safeParse({ timestamps_ms: ts, flash: goodClient(p) }).success);
  assert.equal(livenessMetaSchema.safeParse({ timestamps_ms: ts, flash: { skipped: false } }).success, false);
  assert.equal(livenessMetaSchema.safeParse({ timestamps_ms: ts, flash: { lead: { start_ms: 'x' }, windows: [] } }).success, false);
  assert.equal(livenessMetaSchema.safeParse({ timestamps_ms: ts, flash: { lead: { start_ms: 0, end_ms: 1 }, windows: new Array(9).fill({ start_ms: 0, end_ms: 1 }) } }).success, false);
});
