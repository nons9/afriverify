import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRates, quoteLocal, formatMoney } from '../src/services/local-pricing';
import { checkPayment, PLAN_PRICING } from '../src/services/billing.service';

const RATES = parseRates('{"ngn":{"per_usd":1600,"round_up_to":500},"GHS":{"per_usd":15.3}}');

test('no rates set means no local currencies, and bad entries are dropped', () => {
  assert.deepEqual(parseRates(undefined), {});
  assert.deepEqual(parseRates('not json'), {});
  assert.deepEqual(parseRates('[]'), {});
  assert.deepEqual(parseRates('{"USD":{"per_usd":1},"XX":{"per_usd":5},"NGN":{"per_usd":0},"GHS":{"per_usd":"abc"},"KES":{"per_usd":130,"round_up_to":-1}}'), {});
  assert.deepEqual(Object.keys(RATES).sort(), ['GHS', 'NGN']);
});

test('the local price is the USD price times the rate, rounded UP to the chosen step', () => {
  // 49 USD * 1600 = 78,400 -> rounds up to 78,500
  assert.deepEqual(quoteLocal(4900, 'NGN', RATES), { currency: 'NGN', amountMinor: 7_850_000 });
  assert.deepEqual(quoteLocal(4900, 'ngn', RATES), { currency: 'NGN', amountMinor: 7_850_000 });
  // 49 * 15.3 = 749.7 -> 750 (step 1)
  assert.deepEqual(quoteLocal(4900, 'GHS', RATES), { currency: 'GHS', amountMinor: 75_000 });
  assert.equal(quoteLocal(4900, 'KES', RATES), null);
});

test('formatMoney shows the right currency', () => {
  assert.match(formatMoney(4900, 'USD'), /\$49\.00/);
  assert.match(formatMoney(7_850_000, 'NGN'), /78,500\.00/);
  assert.match(formatMoney(100, 'ZZZ9'), /1\.00/);
});

test('a local payment must match the saved quote in currency and amount', () => {
  const quote = quoteLocal(PLAN_PRICING.starter.amountCents, 'NGN', RATES)!;
  const paid = (amountMinor: number, currency: string) => ({ status: 'successful', amount: amountMinor / 100, currency });
  assert.equal(checkPayment('starter', paid(quote.amountMinor, 'NGN'), quote).ok, true);
  assert.equal(checkPayment('starter', paid(quote.amountMinor - 1, 'NGN'), quote).ok, false, 'one kobo short');
  assert.equal(checkPayment('starter', paid(quote.amountMinor, 'GHS'), quote).ok, false, 'wrong currency');
  assert.equal(checkPayment('starter', paid(4900, 'USD'), quote).ok, false, 'USD does not satisfy a naira quote');
  // With no quote the old USD rule still applies, so 4,900 naira cannot buy a USD plan.
  assert.equal(checkPayment('starter', paid(4900, 'NGN')).ok, false);
});
