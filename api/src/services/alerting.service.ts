import { query } from '../db';
import logger from '../utils/logger';
import { runOncePerInterval } from '../utils/job-lock';
import { claimCooldown, evaluateHttpHealth, sumMetric } from '../utils/metrics';

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


async function sendAlert(eventType: string, total: number, failed: number, rate: number): Promise<void> {
  const message =
    `AfriVerify: ${eventType} failure rate is ${(rate * 100).toFixed(0)}% ` +
    `(${failed}/${total} in the last ${WINDOW_MINUTES}m)`;

  logger.error('Failure rate alert', { event_type: eventType, total, failed, rate });
  await sendOpsAlert(message);
}

export interface AlertDelivery { webhook: 'sent' | 'failed' | 'not_configured'; email: 'sent' | 'failed' | 'not_configured' }

type EmailSender = (opts: { apiKey: string; from: string; to: string[]; subject: string; text: string }) => Promise<void>;

const defaultEmailSender: EmailSender = async ({ apiKey, from, to, subject, text }) => {
  const { Resend } = await import('resend');
  const r = await new Resend(apiKey).emails.send({ from, to, subject, text });
  if (r.error) throw new Error(r.error.message);
};

/**
 * Delivers an ops alert to every configured channel: ALERT_WEBHOOK_URL (Slack-style {text}) and/or
 * ALERT_EMAIL_TO (comma separated, sent through Resend). Never throws. If NO channel is configured the
 * alert is logged as an error, because an alert nobody receives is the same as no alert.
 */
export async function sendOpsAlert(
  message: string,
  deps: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; emailSender?: EmailSender } = {}
): Promise<AlertDelivery> {
  const env = deps.env ?? process.env;
  const doFetch = deps.fetchImpl ?? fetch;
  const out: AlertDelivery = { webhook: 'not_configured', email: 'not_configured' };

  if (env.ALERT_WEBHOOK_URL) {
    try {
      const r = await doFetch(env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
        signal: AbortSignal.timeout(10_000),
      });
      out.webhook = r.ok ? 'sent' : 'failed';
      if (!r.ok) logger.error('Alert webhook rejected the message', { status: r.status });
    } catch (err) {
      out.webhook = 'failed';
      logger.error('Failed to deliver alert webhook', { error: (err as Error).message });
    }
  }

  const to = (env.ALERT_EMAIL_TO ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (to.length && env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
    try {
      await (deps.emailSender ?? defaultEmailSender)({
        apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM_EMAIL, to,
        subject: `[AfriVerify alert] ${message.slice(0, 80)}`, text: message,
      });
      out.email = 'sent';
    } catch (err) {
      out.email = 'failed';
      logger.error('Failed to deliver alert email', { error: (err as Error).message });
    }
  }

  if (out.webhook !== 'sent' && out.email !== 'sent') {
    logger.error('OPS ALERT NOT DELIVERED (set ALERT_EMAIL_TO or ALERT_WEBHOOK_URL)', { message, delivery: out });
  }
  return out;
}

/** Logged once at boot so a deploy with no alert channel is visible in the logs, not silent. */
export function warnIfNoAlertChannel(env: NodeJS.ProcessEnv = process.env): boolean {
  const hasEmail = !!(env.ALERT_EMAIL_TO && env.RESEND_API_KEY && env.RESEND_FROM_EMAIL);
  const ok = !!env.ALERT_WEBHOOK_URL || hasEmail;
  if (!ok) logger.error('NO ALERT CHANNEL CONFIGURED: nobody will be told if the service degrades. Set ALERT_EMAIL_TO or ALERT_WEBHOOK_URL.');
  return ok;
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

    // one page per incident across ALL replicas (Redis), not one per process
    if (!(await claimCooldown(`failure-rate:${row.event_type}`, COOLDOWN_MS / 1000))) continue;
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
    runOncePerInterval('failure-rate-monitor', intervalMs, checkFailureRates).catch((err) =>
      logger.error('Failure rate check errored', { error: (err as Error).message })
    );
  }, intervalMs);
  logger.info('Failure rate monitor started', {
    windowMinutes: WINDOW_MINUTES,
    intervalMinutes: CHECK_INTERVAL_MINUTES,
    threshold: FAILURE_RATE_THRESHOLD
  });
}

// ─── API health monitor: 5xx rate + liveness-engine failures ────────────────────────────────────────────────
const HTTP_WINDOW_MINUTES = 10;
const HTTP_CHECK_MINUTES = parseInt(process.env.HTTP_ALERT_CHECK_MINUTES ?? '5', 10);
const HTTP_CONFIG = {
  minRequests: parseInt(process.env.HTTP_ALERT_MIN_REQUESTS ?? '20', 10),
  errorRate: parseFloat(process.env.HTTP_ALERT_5XX_RATE ?? '0.1'),
  engineErrorThreshold: parseInt(process.env.LIVENESS_ALERT_ENGINE_ERRORS ?? '3', 10),
};

export async function checkHttpHealth(): Promise<void> {
  const [total, errors, engineErrors] = await Promise.all([
    sumMetric('http_total', HTTP_WINDOW_MINUTES),
    sumMetric('http_5xx', HTTP_WINDOW_MINUTES),
    sumMetric('liveness_engine_error', HTTP_WINDOW_MINUTES),
  ]);
  for (const alert of evaluateHttpHealth({ total, errors, engineErrors }, HTTP_CONFIG)) {
    if (!(await claimCooldown(alert.key, 60 * 60))) continue;
    logger.error('API health alert', { alert: alert.key, total, errors, engineErrors });
    await sendOpsAlert(alert.message);
  }
}

export function startHttpHealthMonitor(): void {
  const intervalMs = HTTP_CHECK_MINUTES * 60 * 1000;
  setInterval(() => {
    runOncePerInterval('http-health-monitor', intervalMs, checkHttpHealth).catch((err) =>
      logger.error('HTTP health check errored', { error: (err as Error).message })
    );
  }, intervalMs);
  logger.info('HTTP health monitor started', { windowMinutes: HTTP_WINDOW_MINUTES, ...HTTP_CONFIG });
}
