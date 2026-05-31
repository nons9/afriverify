import { Router, Request, Response } from 'express';
import { Webhook } from 'svix';
import { query, queryOne } from '../db';
import { logger } from '../utils/logger';

export const webhooksRouter = Router();

webhooksRouter.post('/clerk', async (req: Request, res: Response): Promise<void> => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'webhook_secret_not_configured' });
    return;
  }

  const wh = new Webhook(secret);
  let event: { type: string; data: Record<string, unknown> };

  try {
    event = wh.verify(req.body as Buffer, {
      'svix-id': req.headers['svix-id'] as string,
      'svix-timestamp': req.headers['svix-timestamp'] as string,
      'svix-signature': req.headers['svix-signature'] as string,
    }) as typeof event;
  } catch {
    res.status(400).json({ error: 'invalid_signature' });
    return;
  }

  const { type, data } = event;
  logger.info(`Clerk webhook: ${type}`);

  if (type === 'user.created') {
    const d = data as {
      id: string;
      email_addresses: { email_address: string; id: string }[];
      primary_email_address_id: string;
      first_name: string;
      last_name: string;
      image_url: string;
    };
    const primary = d.email_addresses.find(e => e.id === d.primary_email_address_id);
    const email = primary?.email_address ?? d.email_addresses[0]?.email_address ?? '';
    const fullName = [d.first_name, d.last_name].filter(Boolean).join(' ') || 'User';
    await query(
      `INSERT INTO users (clerk_id, email, full_name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (clerk_id) DO NOTHING`,
      [d.id, email, fullName, d.image_url ?? null]
    );
    logger.info(`User provisioned: ${email}`);
  }

  if (type === 'user.updated') {
    const d = data as {
      id: string;
      first_name: string;
      last_name: string;
      image_url: string;
    };
    const fullName = [d.first_name, d.last_name].filter(Boolean).join(' ') || 'User';
    await query(
      `UPDATE users SET full_name = $1, avatar_url = $2, updated_at = NOW() WHERE clerk_id = $3`,
      [fullName, d.image_url ?? null, d.id]
    );
  }

  if (type === 'user.deleted') {
    const d = data as { id: string };
    await query(
      `UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE clerk_id = $1`,
      [d.id]
    );
  }

  res.json({ received: true });
});
