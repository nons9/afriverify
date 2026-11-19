import test from 'node:test';
import assert from 'node:assert/strict';
import { UNIT_WEIGHTS, meteringState, targetUnits, isPremiumPhone, parsePremiumPrefixes, parseEffectiveAt, OTP_MAX_SENDS } from '../src/services/metering-rules';

const day = 86400_000;
const now = new Date('2026-12-01T00:00:00Z');

test('weights: phone 1, ID 3 in total, face 5 in total', () => {
  assert.deepEqual(UNIT_WEIGHTS, { phone: 1, id: 3, face: 5 });
  assert.equal(OTP_MAX_SENDS, 3);
});

test('metering is off with no date and before the date', () => {
  assert.equal(meteringState(now, null), 'off');
  assert.equal(meteringState(now, new Date(now.getTime() + day)), 'off');
});

test('metering is on after the date for customers with no subscription or an old lapsed one', () => {
  const at = new Date(now.getTime() - day);
  assert.equal(meteringState(now, at), 'on');
  assert.equal(meteringState(now, at, { periodStart: new Date(now.getTime() - 60 * day), periodEnd: new Date(now.getTime() - 30 * day) }), 'on');
});

test('a period that began before the date is grandfathered until it ends; a later one is not', () => {
  const at = new Date(now.getTime() - 5 * day);
  assert.equal(meteringState(now, at, { periodStart: new Date(now.getTime() - 10 * day), periodEnd: new Date(now.getTime() + 20 * day) }), 'grandfathered');
  assert.equal(meteringState(now, at, { periodStart: new Date(now.getTime() - 2 * day), periodEnd: new Date(now.getTime() + 28 * day) }), 'on');
  assert.equal(meteringState(new Date(now.getTime() + 21 * day), at, { periodStart: new Date(now.getTime() - 10 * day), periodEnd: new Date(now.getTime() + 20 * day) }), 'on');
});

test('premium prefixes and target units', () => {
  const pre = parsePremiumPrefixes('["234", "+27"]');
  assert.deepEqual(pre, ['234', '27']);
  assert.equal(isPremiumPhone('+2348012345678', pre), true);
  assert.equal(isPremiumPhone('+254700000000', pre), false);
  assert.equal(targetUnits('id', false), 3);
  assert.equal(targetUnits('face', true), 6);
  assert.deepEqual(parsePremiumPrefixes('not json'), []);
  assert.deepEqual(parsePremiumPrefixes(undefined), []);
});

test('effective date parsing ignores junk', () => {
  assert.equal(parseEffectiveAt('nonsense'), null);
  assert.equal(parseEffectiveAt(''), null);
  assert.equal(parseEffectiveAt('2026-12-15T00:00:00Z')!.toISOString(), '2026-12-15T00:00:00.000Z');
});
