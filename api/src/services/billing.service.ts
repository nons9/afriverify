import { randomUUID } from 'crypto';
import { query, queryOne } from '../db';
import { createCheckout } from './flutterwave.service';
import { sendUsageAlertEmail, sendOverageInvoiceEmail, sendSubscriptionPastDueEmail, sendPurchaseConfirmationEmail } from './email-billing.service';
import { generateInvoicePdf } from './pdf-invoice.service';
import { ApiTier } from '../types';
import logger from '../utils/logger';

export const SELF_SERVE_PLANS = ['starter', 'growth'] as const;
export type SelfServePlan = (typeof SELF_SERVE_PLANS)[number];

interface PlanDefinition {
  amountCents: number;
  currency: string;
  monthlyLimit: number;
  label: string;
}

// Growth is priced to reward volume: $0.0149/verification vs Starter's $0.0245.
// Enterprise stays sales-driven — custom pricing, SLA, and dedicated support.
export const PLAN_PRICING: Record<SelfServePlan, PlanDefinition> = {
  starter: { amountCents: 4900, currency: 'USD', monthlyLimit: 2000, label: 'Starter' },
  growth:  { amountCents: 14900, currency: 'USD', monthlyLimit: 10000, label: 'Growth' },
};

// Applied when a subscription lapses without renewal - matches the tier a
// brand-new key gets (see developer.ts's POST /keys).
const FREE_TIER_LIMIT = 100;

// How long an expired subscription keeps working before it's downgraded,
// so a developer whose card needs re-entering doesn't lose access mid-day.
const GRACE_PERIOD_DAYS = 3;

// Per-verification price for usage past the plan's monthly_limit.
const OVERAGE_RATE_CENTS = 3;

export function isSelfServePlan(plan: string): plan is SelfServePlan {
  return (SELF_SERVE_PLANS as readonly string[]).includes(plan);
}

export type UsageVerificationType = 'level1' | 'level2' | 'level3' | 'kyb' | 'aml';

// usage_records existed with nothing ever writing to it - overage billing
// has no data to sum without this. billing_period is the calendar month a
// verification counts toward, independent of when a subscription's own
// current_period_start/end happen to fall.
export async function recordUsage(apiKeyId: string, verificationType: UsageVerificationType): Promise<void> {
  const billingPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
  await query(
    `INSERT INTO usage_records (api_key_id, verification_type, billing_period) VALUES ($1, $2, $3)`,
    [apiKeyId, verificationType, billingPeriod]
  ).catch((err) => logger.error('Failed to record usage', { apiKeyId, verificationType, error: (err as Error).message }));
}

export async function createSubscriptionCheckout(params: {
  apiKeyId: string;
  plan: SelfServePlan;
  email: string;
  redirectUrl: string;
}): Promise<{ paymentLink: string; reference: string }> {
  const pricing = PLAN_PRICING[params.plan];
  const reference = `av-sub-${randomUUID()}`;

  const checkout = await createCheckout({
    email: params.email,
    amount: pricing.amountCents / 100,
    currency: pricing.currency,
    reference,
    redirectUrl: params.redirectUrl,
    metadata: {
      type: 'afriverify_subscription',
      api_key_id: params.apiKeyId,
      plan: params.plan
    }
  });

  return checkout;
}

/**
 * Called from the Flutterwave webhook once a subscription checkout charge
 * succeeds. Idempotent on provider_reference so a retried webhook delivery
 * can't double-activate or double-invoice.
 */
export async function activateSubscription(params: {
  apiKeyId: string;
  plan: SelfServePlan;
  reference: string;
  amountCents: number;
  currency: string;
}): Promise<void> {
  const alreadyProcessed = await queryOne<{ id: string }>(
    `SELECT id FROM invoices WHERE payment_tx_ref = $1`,
    [params.reference]
  );
  if (alreadyProcessed) {
    logger.info('Subscription webhook already processed, skipping', { reference: params.reference });
    return;
  }

  const pricing = PLAN_PRICING[params.plan];
  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const existing = await queryOne<{ id: string }>(`SELECT id FROM subscriptions WHERE api_key_id = $1`, [
    params.apiKeyId
  ]);

  let subscriptionId: string;
  if (existing) {
    subscriptionId = existing.id;
    await query(
      `UPDATE subscriptions SET
         plan = $1, status = 'active', payment_provider = 'flutterwave', provider_reference = $2,
         current_period_start = $3, current_period_end = $4, amount_cents = $5, currency = $6,
         cancel_at_period_end = false, cancelled_at = NULL, usage_alert_80_sent_at = NULL
       WHERE id = $7`,
      [params.plan, params.reference, periodStart, periodEnd, params.amountCents, params.currency, subscriptionId]
    );
  } else {
    const rows = await query<{ id: string }>(
      `INSERT INTO subscriptions
         (api_key_id, plan, status, payment_provider, provider_reference,
          current_period_start, current_period_end, amount_cents, currency)
       VALUES ($1, $2, 'active', 'flutterwave', $3, $4, $5, $6, $7)
       RETURNING id`,
      [params.apiKeyId, params.plan, params.reference, periodStart, periodEnd, params.amountCents, params.currency]
    );
    subscriptionId = rows[0].id;
  }

  await query(`UPDATE api_keys SET tier = $1, monthly_limit = $2 WHERE id = $3`, [
    params.plan,
    pricing.monthlyLimit,
    params.apiKeyId
  ]);

  await query(
    `INSERT INTO invoices
       (subscription_id, api_key_id, status, amount_cents, currency, verifications_included,
        total_amount_cents, payment_tx_ref, paid_at, period_start, period_end)
     VALUES ($1, $2, 'paid', $3, $4, $5, $3, $6, NOW(), $7, $8)`,
    [
      subscriptionId,
      params.apiKeyId,
      params.amountCents,
      params.currency,
      pricing.monthlyLimit,
      params.reference,
      periodStart,
      periodEnd
    ]
  );

  await query(
    `INSERT INTO billing_events (api_key_id, event_type, amount_cents, currency, metadata)
     VALUES ($1, 'subscription_activated', $2, $3, $4)`,
    [params.apiKeyId, params.amountCents, params.currency, JSON.stringify({ plan: params.plan, reference: params.reference })]
  );

  logger.info('Subscription activated', { apiKeyId: params.apiKeyId, plan: params.plan });

  // Send purchase confirmation email with PDF invoice attachment (fire-and-forget).
  const keyInfo = await queryOne<{
    platform_name: string;
    platform_email: string;
    invoice_number: string;
    invoice_id: string;
    verifications_included: string;
  }>(
    `SELECT ak.platform_name, ak.platform_email,
            i.invoice_number, i.id AS invoice_id, i.verifications_included
     FROM api_keys ak
     JOIN invoices i ON i.api_key_id = ak.id AND i.payment_tx_ref = $1`,
    [params.reference]
  );

  if (keyInfo) {
    const invData = {
      invoiceNumber: keyInfo.invoice_number,
      status: 'paid',
      createdAt: new Date(),
      paidAt: new Date(),
      periodStart,
      periodEnd,
      developerEmail: keyInfo.platform_email,
      platformName: keyInfo.platform_name,
      plan: params.plan,
      currency: params.currency,
      amountCents: params.amountCents,
      overageVerifications: 0,
      overageAmountCents: 0,
      totalAmountCents: params.amountCents,
      verificationsIncluded: parseInt(keyInfo.verifications_included, 10),
    };
    generateInvoicePdf(invData)
      .then((pdf) => sendPurchaseConfirmationEmail({ inv: invData, pdfBuffer: pdf }))
      .catch((err) => logger.error('Failed to send purchase confirmation email', { error: (err as Error).message }));
  }
}

interface DueSubscription {
  id: string;
  api_key_id: string;
  plan: ApiTier;
  status: 'active' | 'past_due';
  current_period_start: string;
  current_period_end: string;
  monthly_limit: number;
}

async function closeOutOverage(sub: DueSubscription): Promise<void> {
  const billingPeriod = new Date(sub.current_period_start).toISOString().slice(0, 7); // YYYY-MM

  const usage = await queryOne<{ total: string }>(
    `SELECT COALESCE(SUM(count), 0) as total FROM usage_records
     WHERE api_key_id = $1 AND billing_period = $2`,
    [sub.api_key_id, billingPeriod]
  );
  const total = parseInt(usage?.total ?? '0', 10);
  const overage = Math.max(0, total - sub.monthly_limit);
  if (overage === 0) return;

  const overageAmountCents = overage * OVERAGE_RATE_CENTS;
  const invoiceRows = await query<{ invoice_number: string }>(
    `INSERT INTO invoices
       (subscription_id, api_key_id, status, amount_cents, currency, overage_verifications,
        overage_amount_cents, total_amount_cents, period_start, period_end)
     VALUES ($1, $2, 'open', 0, 'USD', $3, $4, $4, $5, $6)
     RETURNING invoice_number`,
    [sub.id, sub.api_key_id, overage, overageAmountCents, sub.current_period_start, sub.current_period_end]
  );

  await query(
    `INSERT INTO billing_events (api_key_id, event_type, amount_cents, currency, metadata)
     VALUES ($1, 'overage_invoiced', $2, 'USD', $3)`,
    [sub.api_key_id, overageAmountCents, JSON.stringify({ subscription_id: sub.id, overage_verifications: overage })]
  );

  // Email the developer about the overage invoice.
  const keyInfo = await queryOne<{ platform_name: string; platform_email: string }>(
    `SELECT platform_name, platform_email FROM api_keys WHERE id = $1`,
    [sub.api_key_id]
  );
  if (keyInfo && invoiceRows[0]) {
    const period = new Date(sub.current_period_start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    sendOverageInvoiceEmail({
      email: keyInfo.platform_email,
      platformName: keyInfo.platform_name,
      invoiceNumber: invoiceRows[0].invoice_number,
      overageVerifications: overage,
      overageAmountCents,
      period,
    }).catch((err) => logger.error('Failed to send overage invoice email', { error: (err as Error).message }));
  }
}

// Scans all active subscriptions once per billing cycle and sends a one-time
// email when a key has consumed 80%+ of its monthly limit. The alert flag is
// cleared when a new period starts (inside activateSubscription / the monthly
// rollover below), so it fires once per billing period.
async function checkUsageAlerts(): Promise<void> {
  const activeSubs = await query<{
    id: string;
    api_key_id: string;
    plan: string;
    current_period_start: string;
    current_period_end: string;
    monthly_limit: number;
  }>(
    `SELECT s.id, s.api_key_id, s.plan, s.current_period_start, s.current_period_end, ak.monthly_limit
     FROM subscriptions s
     JOIN api_keys ak ON ak.id = s.api_key_id
     WHERE s.status = 'active' AND s.usage_alert_80_sent_at IS NULL`
  );

  for (const sub of activeSubs) {
    const billingPeriod = new Date(sub.current_period_start).toISOString().slice(0, 7);
    const usage = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(count), 0) as total FROM usage_records
       WHERE api_key_id = $1 AND billing_period = $2`,
      [sub.api_key_id, billingPeriod]
    );
    const used = parseInt(usage?.total ?? '0', 10);
    if (used < sub.monthly_limit * 0.8) continue;

    // Mark before sending — if the email fails we still won't spam next run.
    await query(`UPDATE subscriptions SET usage_alert_80_sent_at = NOW() WHERE id = $1`, [sub.id]);

    const keyInfo = await queryOne<{ platform_name: string; platform_email: string }>(
      `SELECT platform_name, platform_email FROM api_keys WHERE id = $1`,
      [sub.api_key_id]
    );
    if (!keyInfo) continue;

    sendUsageAlertEmail({
      email: keyInfo.platform_email,
      platformName: keyInfo.platform_name,
      used,
      limit: sub.monthly_limit,
      plan: sub.plan,
      periodEnd: new Date(sub.current_period_end),
    }).catch((err) => logger.error('Failed to send usage alert email', { error: (err as Error).message }));
  }
}

/**
 * Daily cycle: expires subscriptions past their period end (with a grace
 * window before actually downgrading), closes out usage overage for
 * newly-expired periods, and rolls over each active key's monthly counter.
 * There is no auto-renew charge - matches how subscriptions already work
 * elsewhere in this project (paid upfront, manually renewed), which avoids
 * storing card data or building a separate tokenized-charge/retry path.
 */
export async function runBillingCycle(): Promise<void> {
  // Send 80% quota alerts before processing expirations.
  await checkUsageAlerts().catch((err) =>
    logger.error('Usage alert check failed', { error: (err as Error).message })
  );

  const expiring = await query<DueSubscription>(
    `SELECT s.id, s.api_key_id, s.plan, s.status, s.current_period_start, s.current_period_end, ak.monthly_limit
     FROM subscriptions s
     JOIN api_keys ak ON ak.id = s.api_key_id
     WHERE s.status = 'active' AND s.current_period_end < NOW()`
  );

  for (const sub of expiring) {
    await closeOutOverage(sub);
    await query(`UPDATE subscriptions SET status = 'past_due' WHERE id = $1`, [sub.id]);
    await query(
      `INSERT INTO billing_events (api_key_id, event_type, metadata) VALUES ($1, 'subscription_past_due', $2)`,
      [sub.api_key_id, JSON.stringify({ subscription_id: sub.id })]
    );

    // Notify developer their subscription has lapsed and they have a grace window.
    const keyInfo = await queryOne<{ platform_name: string; platform_email: string }>(
      `SELECT platform_name, platform_email FROM api_keys WHERE id = $1`,
      [sub.api_key_id]
    );
    if (keyInfo) {
      const gracePeriodEndDate = new Date(sub.current_period_end);
      gracePeriodEndDate.setDate(gracePeriodEndDate.getDate() + GRACE_PERIOD_DAYS);
      sendSubscriptionPastDueEmail({
        email: keyInfo.platform_email,
        platformName: keyInfo.platform_name,
        plan: sub.plan,
        gracePeriodEndDate,
      }).catch((err) => logger.error('Failed to send past due email', { error: (err as Error).message }));
    }

    logger.info('Subscription past due', { apiKeyId: sub.api_key_id, subscriptionId: sub.id });
  }

  const overdue = await query<{ id: string; api_key_id: string }>(
    `SELECT id, api_key_id FROM subscriptions
     WHERE status = 'past_due' AND current_period_end < NOW() - ($1 || ' days')::interval`,
    [GRACE_PERIOD_DAYS]
  );

  for (const sub of overdue) {
    await query(`UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`, [sub.id]);
    await query(`UPDATE api_keys SET tier = 'free', monthly_limit = $1 WHERE id = $2`, [FREE_TIER_LIMIT, sub.api_key_id]);
    await query(
      `INSERT INTO billing_events (api_key_id, event_type, metadata) VALUES ($1, 'subscription_cancelled', $2)`,
      [sub.api_key_id, JSON.stringify({ subscription_id: sub.id, reason: 'grace_period_expired' })]
    );
    logger.info('Subscription cancelled after grace period, downgraded to free', { apiKeyId: sub.api_key_id });
  }

  // Free-tier keys (and any key with no active subscription) had no reset
  // mechanism at all before this - a key that hit its limit once stayed
  // blocked forever. Roll the counter over once a month has passed.
  // Also reset usage_alert_80_sent_at so the alert fires in the new period.
  await query(
    `UPDATE api_keys
     SET verifications_this_month = 0, usage_period_start = NOW()
     WHERE usage_period_start < NOW() - INTERVAL '1 month'`
  );

  // Clear per-period alert flag on subscriptions that just rolled over.
  await query(
    `UPDATE subscriptions SET usage_alert_80_sent_at = NULL
     WHERE status = 'active' AND current_period_start > NOW() - INTERVAL '25 hours'`
  );
}

export function startBillingCron(): void {
  const DAY_MS = 24 * 60 * 60 * 1000;
  setInterval(() => {
    runBillingCycle().catch((err) => logger.error('Billing cycle errored', { error: (err as Error).message }));
  }, DAY_MS);
  logger.info('Billing cron scheduled', { intervalHours: 24 });
}
