import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sessionAuth } from '../middleware/sessionAuth';
import { validateBody } from '../middleware/validate';
import { query, queryOne } from '../db';
import { verifyWebhookSignature } from '../services/flutterwave.service';
import { createSubscriptionCheckout, activateSubscription, isSelfServePlan, PLAN_PRICING, SelfServePlan } from '../services/billing.service';
import logger from '../utils/logger';

const router = Router();

// ─── GET /developer/billing ─────────────────────────────────────────────────────────────────────────
// Every key the developer owns, its current plan, and recent invoices.
router.get('/', sessionAuth, async (req: Request, res: Response): Promise<void> => {
  const email = req.developer!.email;

  const keys = await query<{
    id: string;
    platform_name: string;
    environment: string;
    tier: string;
    monthly_limit: string;
  }>(
    `SELECT id, platform_name, environment, tier, monthly_limit FROM api_keys
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
    total_amount_cents: string;
    currency: string;
    period_start: string;
    period_end: string;
    created_at: string;
  }>(
    `SELECT i.id, i.api_key_id, i.invoice_number, i.status, i.total_amount_cents, i.currency,
            i.period_start, i.period_end, i.created_at
     FROM invoices i
     JOIN api_keys ak ON ak.id = i.api_key_id
     WHERE ak.platform_email = $1
     ORDER BY i.created_at DESC LIMIT 20`,
    [email]
  );

  res.json({
    keys: keys.map((k) => ({ ...k, monthly_limit: parseInt(k.monthly_limit, 10) })),
    subscriptions,
    invoices: invoices.map((i) => ({ ...i, total_amount_cents: parseInt(i.total_amount_cents, 10) })),
    plans: PLAN_PRICING
  });
});

// ─── POST /developer/billing/subscribe ──────────────────────────────────────────────────────────────
const subscribeSchema = z.object({
  api_key_id: z.string().uuid(),
  plan: z.string(),
  redirect_url: z.string().url()
});

router.post('/subscribe', sessionAuth, validateBody(subscribeSchema), async (req: Request, res: Response): Promise<void> => {
  const { api_key_id, plan, redirect_url } = req.body as z.infer<typeof subscribeSchema>;
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

  const checkout = await createSubscriptionCheckout({
    apiKeyId: api_key_id,
    plan: plan as SelfServePlan,
    email,
    redirectUrl: redirect_url
  });

  res.json({ payment_link: checkout.paymentLink });
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
  if (!verifyWebhookSignature(req.headers['verif-hash'] as string | undefined)) {
    res.status(401).json({ error: 'invalid_signature' });
    return;
  }

  const event = req.body as FlutterwaveChargeEvent;

  try {
    if (event.event === 'charge.completed' && event.data.status === 'successful') {
      const meta = event.data.meta ?? {};
      if (meta.type === 'afriverify_subscription' && meta.api_key_id && meta.plan && isSelfServePlan(meta.plan)) {
        await activateSubscription({
          apiKeyId: meta.api_key_id,
          plan: meta.plan,
          reference: event.data.tx_ref,
          amountCents: Math.round(event.data.amount * 100),
          currency: event.data.currency
        });
      }
    }
    res.status(200).json({ received: true });
  } catch (err) {
    logger.error('Billing webhook processing failed', { error: (err as Error).message });
    res.status(500).json({ error: 'webhook_processing_failed' });
  }
});

export default router;
