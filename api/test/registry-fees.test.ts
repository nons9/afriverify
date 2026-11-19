import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFees, feeFor, publicFeeList } from '../src/services/registry-fees';
import { checkQuotedPayment } from '../src/services/billing.service';

const T = parseFees('{"ng:nin": 25, "NG:BVN": 20.5, "GH": 40, "*": 60, "bad": 5, "KE": -1, "UG": "x", "ZA": true}');

test('no prices set means no price for anything, and bad entries are dropped', () => {
  assert.deepEqual(parseFees(undefined), {});
  assert.deepEqual(parseFees('nope'), {});
  assert.deepEqual(parseFees('[1]'), {});
  assert.deepEqual(Object.keys(T).sort(), ['*', 'GH', 'NG:BVN', 'NG:NIN']);
});

test('the most specific price wins: country and ID type, then country, then everything else', () => {
  assert.equal(feeFor('NG', 'nin', T), 25);
  assert.equal(feeFor('ng', 'BVN', T), 20.5);
  assert.equal(feeFor('NG', 'PASSPORT', T), 60, 'no NG-wide price, falls to the catch-all');
  assert.equal(feeFor('GH', 'GHANA_CARD', T), 40);
  assert.equal(feeFor('TZ', 'NIDA', T), 60);
  assert.equal(feeFor('TZ', 'NIDA', { 'NG:NIN': 25 }), null, 'unpriced means not checked');
  assert.equal(feeFor('NG', 'NIN', {}), null);
});

test('a price of zero is a free check, not a missing price', () => {
  assert.equal(feeFor('RW', 'NID', parseFees('{"RW":0}')), 0);
});

test('the public list is sorted and carries only scope and price', () => {
  assert.deepEqual(publicFeeList({ GH: 40, '*': 60, 'NG:NIN': 25 }), [{ scope: '*', cents: 60 }, { scope: 'GH', cents: 40 }, { scope: 'NG:NIN', cents: 25 }]);
});

test('a credit payment must meet its quote in the quoted currency', () => {
  const q = { currency: 'NGN', amountMinor: 7_000_000 };
  const paid = (m: number, c = 'NGN', st = 'successful') => ({ status: st, amount: m / 100, currency: c });
  assert.equal(checkQuotedPayment(paid(7_000_000), q).ok, true);
  assert.equal(checkQuotedPayment(paid(6_999_999), q).ok, false);
  assert.equal(checkQuotedPayment(paid(7_000_000, 'USD'), q).ok, false);
  assert.equal(checkQuotedPayment(paid(7_000_000, 'NGN', 'failed'), q).ok, false);
});
