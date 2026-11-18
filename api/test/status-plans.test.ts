import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../src/db';
import * as readiness from '../src/services/readiness.service';
import * as metrics from '../src/utils/metrics';
import { buildStatusDays, overallAvailability, recordStatusTick, _resetStatusRecorderForTests, DayRow } from '../src/services/status.service';
import { getPublicPlans, PLAN_PRICING, FREE_TIER_LIMIT, OVERAGE_RATE_CENTS } from '../src/services/billing.service';

const NOW = new Date('2026-11-18T12:00:00Z');
const row = (day: string, total: number, ok: number, requests = 0, errors = 0): DayRow => ({ day, checks_total: total, checks_ok: ok, requests, errors_5xx: errors });

test('90 consecutive UTC days, oldest first, ending today', () => {
  const d = buildStatusDays([], NOW);
  assert.equal(d.length, 90); assert.equal(d[89].day, '2026-11-18'); assert.equal(d[0].day, '2026-08-21');
  for (let i = 1; i < d.length; i++) assert.ok(d[i].day > d[i - 1].day);
});

test('a day nobody measured is "no data", never 100%', () => {
  const d = buildStatusDays([row('2026-11-17', 1440, 1440)], NOW);
  assert.equal(d[88].availability_pct, 100); assert.equal(d[88].coverage_pct, 100);
  assert.equal(d[87].availability_pct, null); assert.equal(d[87].coverage_pct, 0);
});

test('availability and coverage are computed from checks; today is measured against minutes so far', () => {
  const d = buildStatusDays([row('2026-11-17', 1000, 990), row('2026-11-18', 360, 360)], NOW);
  assert.equal(d[88].availability_pct, 99); near(d[88].coverage_pct, 69.4, 0.1);
  assert.equal(d[89].availability_pct, 100); assert.equal(d[89].coverage_pct, 50);       // 360 of the 720 minutes elapsed by noon
});
function near(a: number, b: number, t: number) { assert.ok(Math.abs(a - b) <= t, `${a} vs ${b}`); }

test('error rate needs requests; overall availability is weighted by checks', () => {
  const d = buildStatusDays([row('2026-11-17', 100, 100, 1000, 5), row('2026-11-16', 100, 100, 0, 0)], NOW);
  assert.equal(d[88].error_rate_pct, 0.5); assert.equal(d[87].error_rate_pct, null);
  assert.equal(overallAvailability([row('a', 1000, 1000), row('b', 10, 0)]), 99.01);
  assert.equal(overallAvailability([]), null);
});

test('plans come from the same constants that bill customers', () => {
  const p = getPublicPlans();
  assert.equal(p.currency, 'USD'); assert.equal(p.free.monthly_limit, FREE_TIER_LIMIT); assert.equal(p.overage_cents_per_verification, OVERAGE_RATE_CENTS);
  const s = p.plans.find((x) => x.id === 'starter')!; const g = p.plans.find((x) => x.id === 'growth')!;
  assert.equal(s.price_monthly_cents, PLAN_PRICING.starter.amountCents); assert.equal(s.monthly_limit, PLAN_PRICING.starter.monthlyLimit);
  assert.equal(s.cents_per_verification, 2.45); assert.equal(g.cents_per_verification, 1.49);
  assert.ok(g.cents_per_verification < s.cents_per_verification, 'growth rewards volume');
});

test('recorder counts failed checks even while the database is down, and flushes them after recovery', async () => {
  _resetStatusRecorderForTests();
  const writes: number[][] = []; let dbUp = false; let ready = false;
  (readiness as any).getReadiness = async () => ({ ok: ready, checks: {} });
  (metrics as any).sumMetric = async (name: string) => (name === 'http_total' ? 40 : 2);
  (db as any).query = async (_sql: string, p: number[]) => { if (!dbUp) throw new Error('db down'); writes.push(p); return []; };
  await recordStatusTick(60_000 * 1000);                       // outage, DB unreachable: nothing saved yet
  await recordStatusTick(60_000 * 1001);                       // still down
  assert.equal(writes.length, 0);
  dbUp = true; ready = true;
  await recordStatusTick(60_000 * 1002);                       // recovery: flush everything
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].slice(0, 2), [3, 1], '3 checks, only 1 passed: the outage minutes are counted');
  assert.deepEqual(writes[0].slice(2), [120, 6], 'request counters summed across the ticks');
  await recordStatusTick(60_000 * 1003);
  assert.deepEqual(writes[1].slice(0, 2), [1, 1], 'pending was cleared after the flush');
});

test('a minute is never counted twice', async () => {
  _resetStatusRecorderForTests();
  const writes: number[][] = [];
  (readiness as any).getReadiness = async () => ({ ok: true, checks: {} });
  (metrics as any).sumMetric = async () => 10;
  (db as any).query = async (_s: string, p: number[]) => { writes.push(p); return []; };
  await recordStatusTick(60_000 * 2000 + 5_000);
  await recordStatusTick(60_000 * 2000 + 40_000);              // same wall-clock minute again
  assert.equal(writes[0][2], 10); assert.equal(writes[1][2], 0, 'the second tick in the same minute adds nothing');
});
