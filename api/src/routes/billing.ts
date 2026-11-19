import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sessionAuth } from '../middleware/sessionAuth';
import { validateBody } from '../middleware/validate';
import { query, queryOne } from '../db';
import { verifyWebhookSignature, verifyTransactionByReference } from '../services/flutterwave.service';
import { formatMoney } from '../services/local-pricing';
import { creditTopup, getCredit } from '../services/registry-credit.service';
import { createSubscriptionCheckout, activateSubscription, isSelfServePlan, checkPayment, checkQuotedPayment, createCreditCheckout, getCheckoutQuote, PLAN_PRICING, SelfServePlan } from '../services/billing.service';
import logger from '../utils/logger';

const router = Router();

// ─── GET /developer/billing ─────────────────────────────────────────────────────────────────────────
router.get('/', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const email = req.developer!.email;

  const keys = await query<{
    id: string;
    platform_name: string;
    environment: string;
    tier: string;
    monthly_limit: string;
    verifications_this_month: string;
    registry_balance_cents: string;
  }>(
    `SELECT id, platform_name, environment, tier, monthly_limit, verifications_this_month, registry_balance_cents
     FROM api_keys
     WHERE platform_email = $1 AND is_active = true`,
    [email]
  );

  const subscriptions = await query<{
    api_key_id: string;
    plan: string;
    status: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
  }>(
    `SELECT s.api_key_id, s.plan, s.status, s.current_period_end, s.cancel_at_period_end
     FROM subscriptions s
     JOIN api_keys ak ON ak.id = s.api_key_id
     WHERE ak.platform_email = $1`,
    [email]
  );

  const invoices = await query<{
    id: string;
    api_key_id: string;
    invoice_number: string;
    status: string;
    amount_cents: string;
    overage_verifications: string;
    overage_amount_cents: string;
    total_amount_cents: string;
    verifications_included: string;
    currency: string;
    period_start: string;
    period_end: string;
    paid_at: string | null;
    created_at: string;
  }>(
    `SELECT i.id, i.api_key_id, i.invoice_number, i.status,
            i.amount_cents, i.overage_verifications, i.overage_amount_cents,
            i.total_amount_cents, i.verifications_included, i.currency,
            i.period_start, i.period_end, i.paid_at, i.created_at
     FROM invoices i
     JOIN api_keys ak ON ak.id = i.api_key_id
     WHERE ak.platform_email = $1
     ORDER BY i.created_at DESC LIMIT 20`,
    [email]
  );

  res.json({
    keys: keys.map((k) => ({
      ...k,
      monthly_limit: parseInt(k.monthly_limit, 10),
      verifications_this_month: parseInt(k.verifications_this_month, 10),
      registry_balance_cents: Number(k.registry_balance_cents),
    })),
    subscriptions,
    invoices: invoices.map((i) => ({
      ...i,
      amount_cents: parseInt(i.amount_cents, 10),
      overage_verifications: parseInt(i.overage_verifications, 10),
      overage_amount_cents: parseInt(i.overage_amount_cents, 10),
      total_amount_cents: parseInt(i.total_amount_cents, 10),
      verifications_included: parseInt(i.verifications_included, 10),
    })),
    plans: PLAN_PRICING,
  });
});

// ─── POST /developer/billing/subscribe ──────────────────────────────────────────────────────────────
const subscribeSchema = z.object({
  api_key_id: z.string().uuid(),
  plan: z.string(),
  redirect_url: z.string().url(),
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional()
});

router.post('/subscribe', sessionAuth, validateBody(subscribeSchema), async (req: Request, res: Response): Promise<void> => {
  const { api_key_id, plan, redirect_url, currency } = req.body as z.infer<typeof subscribeSchema>;
  const email = req.developer!.email;

  if (!isSelfServePlan(plan)) {
    res.status(400).json({
      error: 'plan_not_self_serve',
      message: 'This plan is not available for self-serve checkout. Contact sales@sankofaapp.com.'
    });
    return;
  }

  const apiKey = await queryOne<{ id: string }>(
    `SELECT id FROM api_keys WHERE id = $1 AND platform_email = $2 AND is_active = true`,
    [api_key_id, email]
  );
  if (!apiKey) {
    res.status(404).json({ error: 'not_found', message: 'Key not found' });
    return;
  }

  let checkout;
  try {
    checkout = await createSubscriptionCheckout({
      apiKeyId: api_key_id,
      plan: plan as SelfServePlan,
      email,
      redirectUrl: redirect_url,
      currency
    });
  } catch (err) {
    if ((err as Error).message === 'currency_not_supported') {
      res.status(400).json({ error: 'currency_not_supported', message: 'That currency is not available. Pay in USD, or see /v1/plans for the currencies on offer.' });
      return;
    }
    throw err;
  }

  res.json({ payment_link: checkout.paymentLink });
});

// ─── Prepaid registry-check credit ──────────────────────────────────────────────────────────────────
const topupSchema = z.object({
  api_key_id: z.string().uuid(),
  amount_usd: z.number().int(),
  redirect_url: z.string().url(),
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
});

router.get('/credit/:apiKeyId', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const owned = await queryOne<{ id: string }>(
    `SELECT id FROM api_keys WHERE id = $1 AND platform_email = $2`, [req.params.apiKeyId, req.developer!.email]);
  if (!owned) { res.status(404).json({ error: 'not_found', message: 'Key not found' }); return; }
  res.json(await getCredit(owned.id));
});

router.post('/credit/topup', sessionAuth, validateBody(topupSchema), async (req: Request, res: Response): Promise<void> => {
  const { api_key_id, amount_usd, redirect_url, currency } = req.body as z.infer<typeof topupSchema>;
  const owned = await queryOne<{ id: string }>(
    `SELECT id FROM api_keys WHERE id = $1 AND platform_email = $2 AND is_active = true`, [api_key_id, req.developer!.email]);
  if (!owned) { res.status(404).json({ error: 'not_found', message: 'Key not found' }); return; }
  try {
    const c = await createCreditCheckout({ apiKeyId: api_key_id, email: req.developer!.email, redirectUrl: redirect_url, usd: amount_usd, currency });
    res.json({ payment_link: c.paymentLink });
  } catch (err) {
    const m = (err as Error).message;
    if (m === 'amount_out_of_range') { res.status(400).json({ error: 'amount_out_of_range', message: 'Top up a whole number of US dollars, from 5 to 500.' }); return; }
    if (m === 'currency_not_supported') { res.status(400).json({ error: 'currency_not_supported', message: 'That currency is not available. Pay in USD, or see /v1/plans for the currencies on offer.' }); return; }
    throw err;
  }
});

// ─── GET /developer/billing/invoices/:id ────────────────────────────────────────────────────────────
// Returns a print-ready HTML invoice the developer can save as PDF via browser print.
router.get('/invoices/:id', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const email = req.developer!.email;

  const inv = await queryOne<{
    id: string;
    invoice_number: string;
    status: string;
    amount_cents: number;
    overage_verifications: number;
    overage_amount_cents: number;
    total_amount_cents: number;
    verifications_included: number;
    currency: string;
    period_start: string;
    period_end: string;
    paid_at: string | null;
    created_at: string;
    platform_name: string;
    plan: string;
  }>(
    `SELECT i.id, i.invoice_number, i.status,
            i.amount_cents, i.overage_verifications, i.overage_amount_cents,
            i.total_amount_cents, i.verifications_included, i.currency,
            i.period_start, i.period_end, i.paid_at, i.created_at,
            ak.platform_name, COALESCE(s.plan, ak.tier) AS plan
     FROM invoices i
     JOIN api_keys ak ON ak.id = i.api_key_id
     LEFT JOIN subscriptions s ON s.id = i.subscription_id
     WHERE i.id = $1 AND ak.platform_email = $2`,
    [req.params.id, email]
  );

  if (!inv) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const fmt = (cents: number) => formatMoney(cents, inv.currency || 'USD');
  const fmtUsd = (cents: number) => formatMoney(cents, 'USD');
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const rows: string[] = [];
  if (inv.verifications_included > 0 || inv.amount_cents > 0) {
    rows.push(`<tr>
      <td>Subscription - ${inv.plan.charAt(0).toUpperCase() + inv.plan.slice(1)} plan</td>
      <td>${inv.verifications_included.toLocaleString()} verifications included</td>
      <td style="text-align:right">${fmt(inv.amount_cents)}</td>
    </tr>`);
  }
  if (inv.overage_verifications > 0) {
    rows.push(`<tr>
      <td>Usage overage</td>
      <td>${inv.overage_verifications.toLocaleString()} × ${fmtUsd(3)}</td>
      <td style="text-align:right">${fmt(inv.overage_amount_cents)}</td>
    </tr>`);
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Invoice ${inv.invoice_number}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #111; margin: 0; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
  .brand { font-size: 22px; font-weight: bold; letter-spacing: -0.5px; }
  .brand span { color: #c9960e; }
  .meta { text-align: right; color: #555; font-size: 12px; line-height: 1.8; }
  h2 { font-size: 28px; margin: 0 0 4px; }
  .status { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; background: ${inv.status === 'paid' ? '#d1fae5' : '#fef3c7'}; color: ${inv.status === 'paid' ? '#065f46' : '#92400e'}; }
  .block { margin-bottom: 28px; }
  .block label { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #999; display: block; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; }
  thead tr { background: #f5f5f5; }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 13px; }
  tfoot tr td { font-weight: bold; font-size: 14px; border-top: 2px solid #111; border-bottom: none; }
  .note { font-size: 11px; color: #999; margin-top: 32px; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Afri<span>Verify</span></div>
      <div style="color:#777;font-size:11px;margin-top:4px;">afriverify.sankofaapp.com</div>
    </div>
    <div class="meta">
      <div style="font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:1px;">Invoice</div>
      <div style="font-size:20px;font-weight:bold;">${inv.invoice_number}</div>
      <div>Issued: ${fmtDate(inv.created_at)}</div>
      ${inv.paid_at ? `<div>Paid: ${fmtDate(inv.paid_at)}</div>` : ''}
    </div>
  </div>

  <div style="display:flex;gap:48px;margin-bottom:32px;">
    <div class="block">
      <label>Billed to</label>
      <div>${email}</div>
      <div style="color:#777;">${inv.platform_name}</div>
    </div>
    <div class="block">
      <label>Billing period</label>
      <div>${fmtDate(inv.period_start)} – ${fmtDate(inv.period_end)}</div>
    </div>
    <div class="block">
      <label>Status</label>
      <span class="status">${inv.status}</span>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Details</th>
        <th style="text-align:right">Amount (${inv.currency})</th>
      </tr>
    </thead>
    <tbody>
      ${rows.join('')}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2">Total</td>
        <td style="text-align:right">${fmt(inv.total_amount_cents)}</td>
      </tr>
    </tfoot>
  </table>

  <p class="note">Thank you for using AfriVerify. For questions about this invoice, contact billing@sankofaapp.com.</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename="${inv.invoice_number}.html"`);
  res.send(html);
});

// ─── POST /developer/billing/webhook ────────────────────────────────────────────────────────────────
// Flutterwave verifies webhooks with a static shared secret compared against
// the 'verif-hash' header, not a body HMAC, so this can use the regular JSON
// body parser rather than needing raw bytes.
interface FlutterwaveChargeEvent {
  event: string;
  data: {
    tx_ref: string;
    status: string;
    amount: number;
    currency: string;
    meta?: { type?: string; api_key_id?: string; plan?: string };
  };
}

router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  // Every branch below logs something - a 401 or a no-op skip used to leave
  // zero trace, which made "did Flutterwave even reach us" indistinguishable
  // from "it reached us and we ignored it" when debugging from logs alone.
  if (!verifyWebhookSignature(req.headers['verif-hash'] as string | undefined)) {
    logger.warn('Billing webhook rejected: signature mismatch', {
      hasHeader: !!req.headers['verif-hash']
    });
    res.status(401).json({ error: 'invalid_signature' });
    return;
  }

  const event = req.body as FlutterwaveChargeEvent;
  logger.info('Billing webhook received', { event: event?.event, status: event?.data?.status });

  try {
    if (event.event === 'charge.completed' && event.data.status === 'successful') {
      const meta = event.data.meta ?? {};
      if (meta.type === 'afriverify_subscription' && meta.api_key_id && meta.plan && isSelfServePlan(meta.plan)) {
        // The webhook body is only a CLAIM. Ask the provider what was really paid, and only activate a plan
        // that was paid for in full, in the plan's currency. (If the provider cannot be reached this throws,
        // we answer 500, and the provider retries the webhook later.)
        const confirmed = await verifyTransactionByReference(event.data.tx_ref);
        // A local-currency checkout has a quote we saved when it started; it, not the webhook, says what was agreed.
        const quote = await getCheckoutQuote(event.data.tx_ref);
        const check = confirmed.reference !== event.data.tx_ref
          ? { ok: false as const, reason: 'provider reference does not match the webhook' }
          : quote && (quote.plan !== meta.plan || quote.api_key_id !== meta.api_key_id)
            ? { ok: false as const, reason: 'webhook does not match the saved quote' }
            : checkPayment(meta.plan, confirmed, quote);
        if (!check.ok) {
          logger.error('Billing webhook: payment does not match the plan, NOT activating', { reference: event.data.tx_ref, plan: meta.plan, reason: check.reason });
          res.status(200).json({ received: true, activated: false });
          return;
        }
        await activateSubscription({
          apiKeyId: meta.api_key_id,
          plan: meta.plan,
          reference: event.data.tx_ref,
          amountCents: Math.round(Number(confirmed.amount) * 100),
          currency: confirmed.currency
        });
      } else if (meta.type === 'afriverify_credit' && meta.api_key_id) {
        // A credit top-up is paid only against a quote we saved. Without one (or with another key's) nothing is added.
        const confirmed = await verifyTransactionByReference(event.data.tx_ref);
        const quote = await getCheckoutQuote(event.data.tx_ref);
        const check = confirmed.reference !== event.data.tx_ref
          ? { ok: false as const, reason: 'provider reference does not match the webhook' }
          : !quote || quote.plan !== 'credit' || !quote.usdCents || quote.api_key_id !== meta.api_key_id
            ? { ok: false as const, reason: 'no matching credit quote' }
            : checkQuotedPayment(confirmed, quote);
        if (!check.ok || !quote?.usdCents) {
          logger.error('Billing webhook: credit payment does not match its quote, NOT adding credit', { reference: event.data.tx_ref, reason: check.ok ? 'no quote' : check.reason });
          res.status(200).json({ received: true, credited: false });
          return;
        }
        await creditTopup({ apiKeyId: quote.api_key_id, usdCents: quote.usdCents, reference: event.data.tx_ref });
      } else {
        logger.warn('Billing webhook: charge.completed but not an AfriVerify subscription meta, skipping', { meta });
      }
    }
    res.status(200).json({ received: true });
  } catch (err) {
    logger.error('Billing webhook processing failed', { error: (err as Error).message });
    res.status(500).json({ error: 'webhook_processing_failed' });
  }
});

export default router;
