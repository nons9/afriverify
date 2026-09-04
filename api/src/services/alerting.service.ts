import { query } from '../db';
import logger from '../utils/logger';

interface FailureRateRow {
  event_type: string;
  total: string;
  failed: string;
}

// Event types whose failure rate says something about a real dependency
// (SMS providers, Smile Identity, DeepScan) rather than user error like a
// mistyped OTP digit, which is expected to fail sometimes and isn't a
// signal anything is broken.
const MONITORED_EVENT_TYPES = ['otp_sent', 'id_verified', 'liveness_passed'];

const WINDOW_MINUTES = parseInt(process.env.ALERT_WINDOW_MINUTES ?? '30', 10);
const CHECK_INTERVAL_MINUTES = parseInt(process.env.ALERT_CHECK_INTERVAL_MINUTES ?? '15', 10);
const FAILURE_RATE_THRESHOLD = parseFloat(process.env.ALERT_FAILURE_RATE_THRESHOLD ?? '0.5');
const MIN_SAMPLE_SIZE = parseInt(process.env.ALERT_MIN_SAMPLE_SIZE ?? '5', 10);
const COOLDOWN_MS = 60 * 60 * 1000;

const lastAlertedAt = new Map<string, number>();

async function sendAlert(eventType: string, total: number, failed: number, rate: number): Promise<void> {
  const message =
    `AfriVerify: ${eventType} failure rate is ${(rate * 100).toFixed(0)}% ` +
    `(${failed}/${total} in the last ${WINDOW_MINUTES}m)`;

  logger.error('Failure rate alert', { event_type: eventType, total, failed, rate });

  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
      signal: AbortSignal.timeout(10_000)
    });
  } catch (err) {
    logger.error('Failed to deliver alert webhook', { error: (err as Error).message });
  }
}

async function checkFailureRates(): Promise<void> {
  const rows = await query<FailureRateRow>(
    `SELECT event_type::text,
            COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE result = 'failed')::text AS failed
     FROM verification_events
     WHERE event_type = ANY($1) AND created_at > NOW() - ($2 || ' minutes')::interval
     GROUP BY event_type`,
    [MONITORED_EVENT_TYPES, WINDOW_MINUTES]
  );

  for (const row of rows) {
    const total = parseInt(row.total, 10);
    const failed = parseInt(row.failed, 10);
    if (total < MIN_SAMPLE_SIZE) continue;

    const rate = failed / total;
    if (rate < FAILURE_RATE_THRESHOLD) continue;

    const lastAlert = lastAlertedAt.get(row.event_type) ?? 0;
    if (Date.now() - lastAlert < COOLDOWN_MS) continue;

    lastAlertedAt.set(row.event_type, Date.now());
    await sendAlert(row.event_type, total, failed, rate);
  }
}

// Off by default in effect: with low verification volume the MIN_SAMPLE_SIZE
// gate keeps this quiet, and with no ALERT_WEBHOOK_URL set it only ever logs.
// Set ALERT_WEBHOOK_URL (a Slack incoming webhook URL, or any endpoint that
// accepts { text: string }) to actually get paged.
export function startFailureRateMonitor(): void {
  const intervalMs = CHECK_INTERVAL_MINUTES * 60 * 1000;
  setInterval(() => {
    checkFailureRates().catch((err) =>
      logger.error('Failure rate check errored', { error: (err as Error).message })
    );
  }, intervalMs);
  logger.info('Failure rate monitor started', {
    windowMinutes: WINDOW_MINUTES,
    intervalMinutes: CHECK_INTERVAL_MINUTES,
    threshold: FAILURE_RATE_THRESHOLD
  });
}
