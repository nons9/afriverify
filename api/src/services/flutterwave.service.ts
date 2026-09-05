import axios, { AxiosInstance } from 'axios';
import { timingSafeEqual } from 'crypto';

let client: AxiosInstance | null = null;

function getClient(): AxiosInstance {
  if (client) return client;
  const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!secretKey) throw new Error('FLUTTERWAVE_SECRET_KEY environment variable is not set');

  client = axios.create({
    baseURL: 'https://api.flutterwave.com/v3',
    timeout: 15_000,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json'
    }
  });
  return client;
}

export interface CheckoutResult {
  paymentLink: string;
  reference: string;
}

export async function createCheckout(params: {
  email: string;
  amount: number;
  currency: string;
  reference: string;
  redirectUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<CheckoutResult> {
  const response = await getClient().post('/payments', {
    tx_ref: params.reference,
    amount: params.amount,
    currency: params.currency,
    redirect_url: params.redirectUrl,
    customer: { email: params.email },
    meta: params.metadata
  });

  return { paymentLink: response.data.data.link, reference: params.reference };
}

export async function verifyTransactionByReference(reference: string): Promise<{
  status: string;
  amount: number;
  currency: string;
  reference: string;
}> {
  const response = await getClient().get('/transactions/verify_by_reference', { params: { tx_ref: reference } });
  const data = response.data.data;
  return { status: data.status, amount: data.amount, currency: data.currency, reference: data.tx_ref };
}

// Constant-time comparison so a partial-match timing side channel can't be
// used to guess the configured secret hash byte by byte.
export function verifyWebhookSignature(receivedHash: string | undefined): boolean {
  const expected = process.env.FLUTTERWAVE_SECRET_HASH || '';
  if (!expected || !receivedHash) return false;

  const a = Buffer.from(receivedHash);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(b, b); // burn comparable time without leaking length
    return false;
  }
  return timingSafeEqual(a, b);
}
