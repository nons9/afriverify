import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPayment, PLAN_PRICING } from '../src/services/billing.service';

const paid = (cents: number, currency = 'USD', status = 'successful') => ({ status, amount: cents / 100, currency });

test('a full payment in the plan currency is accepted', () => {
  assert.deepEqual(checkPayment('starter', paid(PLAN_PRICING.starter.amountCents)), { ok: true });
  assert.deepEqual(checkPayment('growth', paid(PLAN_PRICING.growth.amountCents)), { ok: true });
});

test('overpaying is accepted, underpaying by even one cent is not', () => {
  assert.equal(checkPayment('starter', paid(PLAN_PRICING.starter.amountCents + 500)).ok, true);
  assert.equal(checkPayment('starter', paid(PLAN_PRICING.starter.amountCents - 1)).ok, false);
});

test('paying for the cheap plan cannot buy the expensive one', () => {
  const r = checkPayment('growth', paid(PLAN_PRICING.starter.amountCents));
  assert.equal(r.ok, false);
});

test('wrong currency, unsuccessful status and nonsense amounts are refused', () => {
  assert.equal(checkPayment('starter', paid(4900, 'NGN')).ok, false);
  assert.equal(checkPayment('starter', paid(4900, 'usd')).ok, true, 'currency compares case-insensitively');
  assert.equal(checkPayment('starter', paid(4900, 'USD', 'failed')).ok, false);
  assert.equal(checkPayment('starter', paid(4900, 'USD', 'pending')).ok, false);
  assert.equal(checkPayment('starter', { status: 'successful', amount: Number.NaN, currency: 'USD' }).ok, false);
  assert.equal(checkPayment('starter', { status: 'successful', amount: -49, currency: 'USD' }).ok, false);
});

test('floating point cannot shave a cent off the price', () => {
  assert.equal(checkPayment('starter', { status: 'successful', amount: 48.999999, currency: 'USD' }).ok, true, 'rounds to 4900 cents');
  assert.equal(checkPayment('starter', { status: 'successful', amount: 48.99, currency: 'USD' }).ok, false);
});
