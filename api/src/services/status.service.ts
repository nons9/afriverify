/**
 * Public status: what is true right now, and a 90-day record of our own once-a-minute readiness checks.
 * Honest by construction: every day reports availability AND coverage, and a day nobody measured is "no data",
 * never 100%.
 */
import { query } from '../db';
import { getReadiness } from './readiness.service';
import { sumMetric } from '../utils/metrics';
import { runOncePerInterval } from '../utils/job-lock';
import logger from '../utils/logger';

const TICK_MS = 60_000;
const MINUTES_PER_DAY = 1440;

export interface DayRow { day: string; checks_total: number; checks_ok: number; requests: number; errors_5xx: number }
export interface StatusDay {
  day: string;
  availability_pct: number | null;   // share of our own readiness checks that passed; null = no checks that day
  coverage_pct: number;              // share of the day's minutes we actually checked
  requests: number;
  errors_5xx: number;
  error_rate_pct: number | null;
}

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

/** Pure: turn stored rows into exactly `days` consecutive UTC days ending at `now`, gaps explicit. */
export function buildStatusDays(rows: DayRow[], now: Date, days = 90): StatusDay[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: StatusDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)).toISOString().slice(0, 10);
    const r = byDay.get(d);
    if (!r || r.checks_total === 0) {
      out.push({ day: d, availability_pct: null, coverage_pct: 0, requests: r?.requests ?? 0, errors_5xx: r?.errors_5xx ?? 0, error_rate_pct: null });
      continue;
    }
    const isToday = d === now.toISOString().slice(0, 10);
    const minutesSoFar = isToday ? Math.max(1, now.getUTCHours() * 60 + now.getUTCMinutes()) : MINUTES_PER_DAY;
    out.push({
      day: d,
      availability_pct: round((100 * r.checks_ok) / r.checks_total),
      coverage_pct: round(Math.min(100, (100 * r.checks_total) / minutesSoFar), 1),
      requests: r.requests,
      errors_5xx: r.errors_5xx,
      error_rate_pct: r.requests > 0 ? round((100 * r.errors_5xx) / r.requests, 3) : null,
    });
  }
  return out;
}

/** Pure: overall availability across the days we actually measured (checks-weighted), or null. */
export function overallAvailability(rows: DayRow[]): number | null {
  const total = rows.reduce((a, r) => a + r.checks_total, 0);
  const ok = rows.reduce((a, r) => a + r.checks_ok, 0);
  return total > 0 ? round((100 * ok) / total) : null;
}

export async function getPublicStatus(now = new Date()) {
  const ready = await getReadiness();
  const rows = (await query<DayRow & { day: Date | string }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, checks_total, checks_ok, requests::int AS requests, errors_5xx::int AS errors_5xx
     FROM status_daily WHERE day > (CURRENT_DATE - 90) ORDER BY day`
  ).catch(() => [])) as unknown as DayRow[];
  const checks = ready.checks;
  const comp = (v: unknown) => (v === 'ok' || v === 'current' ? 'operational' : 'down');
  return {
    status: ready.ok ? 'operational' : 'outage',
    checked_at: now.toISOString(),
    components: { database: comp(checks.database), cache: comp(checks.redis), migrations: comp(checks.migrations) },
    uptime_90d_pct: overallAvailability(rows),
    observed_since: rows.find((r) => r.checks_total > 0)?.day ?? null,
    days: buildStatusDays(rows, now),
    method: 'Self-measured: the API checks its own database, cache and migrations once a minute. We publish coverage next to availability. A full outage of the API itself cannot record itself, so treat gaps as unknown, not as uptime.',
  };
}

// ── recorder ──────────────────────────────────────────────────────────────────

let pending = { total: 0, ok: 0, requests: 0, errors: 0 };
let lastMinute = -1;

/** One tick: check readiness, add the previous minute's request counters, flush when the database is reachable. */
export async function recordStatusTick(now = Date.now()): Promise<void> {
  const ready = await getReadiness().catch(() => ({ ok: false, checks: {} }));
  pending.total += 1;
  if (ready.ok) pending.ok += 1;

  const minute = Math.floor(now / 60_000) - 1;                     // the last COMPLETE minute
  if (minute !== lastMinute) {
    lastMinute = minute;
    const [req, err] = await Promise.all([
      sumMetric('http_total', 1, minute * 60_000).catch(() => 0),
      sumMetric('http_5xx', 1, minute * 60_000).catch(() => 0),
    ]);
    pending.requests += req; pending.errors += err;
  }

  const p = pending;
  try {
    await query(
      `INSERT INTO status_daily (day, checks_total, checks_ok, requests, errors_5xx)
       VALUES (CURRENT_DATE, $1, $2, $3, $4)
       ON CONFLICT (day) DO UPDATE SET checks_total = status_daily.checks_total + $1, checks_ok = status_daily.checks_ok + $2,
         requests = status_daily.requests + $3, errors_5xx = status_daily.errors_5xx + $4, updated_at = NOW()`,
      [p.total, p.ok, p.requests, p.errors]
    );
    pending = { total: 0, ok: 0, requests: 0, errors: 0 };         // flushed
  } catch (err) {
    // database unreachable: keep the failed checks in memory so the outage is still counted once it recovers
    logger.warn(`Status tick could not be saved yet: ${(err as Error).message}`);
  }
}

export function startStatusRecorder(): void {
  setInterval(() => {
    runOncePerInterval('status-tick', TICK_MS, () => recordStatusTick()).catch((err) =>
      logger.error('Status recorder errored', { error: (err as Error).message })
    );
  }, TICK_MS);
  logger.info('Status recorder scheduled', { intervalSeconds: 60 });
}

export function _resetStatusRecorderForTests(): void { pending = { total: 0, ok: 0, requests: 0, errors: 0 }; lastMinute = -1; }
