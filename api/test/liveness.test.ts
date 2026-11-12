// Run: npm test   (node:test + ts-node, no DB/S3/engine needed)
process.env.AWS_ACCESS_KEY_ID ??= 'x';
process.env.AWS_SECRET_ACCESS_KEY ??= 'x';
process.env.S3_BUCKET_NAME ??= 'x';
import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, generateChallenges, isLivenessRequired, livenessEnabled } from '../src/services/liveness.service';

test('liveness fail always rejects, regardless of face match', () => {
  assert.equal(decide({ verdict: 'fail' }, { verdict: 'match' }), 'rejected');
  assert.equal(decide({ verdict: 'fail' }, null), 'rejected');
});

test('approval needs BOTH a passing liveness and a matching face', () => {
  assert.equal(decide({ verdict: 'pass' }, { verdict: 'match' }), 'approved');
  assert.equal(decide({ verdict: 'review' }, { verdict: 'match' }), 'needs_second_opinion');
  assert.equal(decide({ verdict: 'pass' }, { verdict: 'review' }), 'needs_second_opinion');
  assert.equal(decide({ verdict: 'pass' }, { verdict: 'unable' }), 'needs_second_opinion');
});

test('a different person is rejected even if the scan was live', () => {
  assert.equal(decide({ verdict: 'pass' }, { verdict: 'no_match' }), 'rejected');
  assert.equal(decide({ verdict: 'review' }, { verdict: 'no_match' }), 'rejected');
});

test('no ID photo to compare against never auto-approves', () => {
  assert.equal(decide({ verdict: 'pass' }, null), 'needs_second_opinion');
});

test('challenge sequence: one turn + blink + smile, random order and direction', () => {
  const seen = new Set<string>();
  let leftSeen = false, rightSeen = false;
  for (let i = 0; i < 300; i++) {
    const c = generateChallenges();
    assert.equal(c.length, 3);
    assert.equal(c.filter((x) => x === 'blink').length, 1);
    assert.equal(c.filter((x) => x === 'smile').length, 1);
    assert.equal(c.filter((x) => x === 'turn_left' || x === 'turn_right').length, 1);
    if (c.includes('turn_left')) leftSeen = true; else rightSeen = true;
    seen.add(c.join(','));
  }
  assert.ok(leftSeen && rightSeen, 'both turn directions occur');
  assert.ok(seen.size >= 10, `expected many distinct orderings, got ${seen.size}`);
});

test('liveness is only enforced when the engine is configured', () => {
  delete process.env.LIVENESS_ENGINE_URL;
  assert.equal(livenessEnabled(), false);
  assert.equal(isLivenessRequired({ liveness_required: true }), false);
  process.env.LIVENESS_ENGINE_URL = 'http://engine:8100';
  assert.equal(isLivenessRequired({ liveness_required: true }), true);
  assert.equal(isLivenessRequired({ liveness_required: false }), false);
  process.env.LIVENESS_REQUIRED = 'true';
  assert.equal(isLivenessRequired({ liveness_required: false }), true);
});
