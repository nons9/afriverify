import twilio from 'twilio';
import axios from 'axios';
import logger from '../utils/logger';

function maskPhone(phone: string): string {
  return `${phone.substring(0, 4)}****${phone.slice(-3)}`;
}

// Each provider below is a plain "send this text message" call - none of
// them own the verification state. The 6-digit code is generated and
// hashed by the caller (routes/verify.ts) and checked against
// verification_sessions.otp_hash, so swapping/adding/removing a provider
// here never touches how a code is confirmed.

async function sendViaTwilio(phone: string, message: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) throw new Error('Twilio not configured');

  const client = twilio(sid, token);
  await client.messages.create({ to: phone, from, body: message });
}

async function sendViaTermii(phone: string, message: string): Promise<void> {
  const apiKey = process.env.TERMII_API_KEY;
  if (!apiKey) throw new Error('Termii not configured');

  const res = await axios.post(
    'https://api.ng.termii.com/api/sms/send',
    {
      api_key: apiKey,
      to: phone,
      from: process.env.TERMII_SENDER_ID ?? 'AfriVerify',
      sms: message,
      type: 'plain',
      channel: 'dnd',
    },
    { timeout: 10000 },
  );
  if (res.data?.code && res.data.code !== 'ok') {
    throw new Error(`Termii send failed: ${JSON.stringify(res.data)}`);
  }
}

async function sendViaAfricasTalking(phone: string, message: string): Promise<void> {
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  const username = process.env.AFRICASTALKING_USERNAME;
  if (!apiKey || !username) throw new Error("Africa's Talking not configured");

  const isSandbox = username === 'sandbox';
  const url = isSandbox
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';

  const params = new URLSearchParams({ username, to: phone, message });
  if (process.env.AFRICASTALKING_SENDER_ID) params.set('from', process.env.AFRICASTALKING_SENDER_ID);

  const res = await axios.post(url, params, {
    headers: { apiKey, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    timeout: 10000,
  });
  const recipients = res.data?.SMSMessageData?.Recipients as Array<{ status: string }> | undefined;
  if (!recipients?.length || !recipients.every((r) => r.status === 'Success')) {
    throw new Error(`Africa's Talking send failed: ${JSON.stringify(res.data)}`);
  }
}

const PROVIDERS: Array<{ name: string; send: (phone: string, message: string) => Promise<void> }> = [
  { name: 'Twilio', send: sendViaTwilio },
  { name: "Africa's Talking", send: sendViaAfricasTalking },
  { name: 'Termii', send: sendViaTermii },
];

export async function sendSms(phone: string, message: string): Promise<void> {
  const errors: string[] = [];
  for (const provider of PROVIDERS) {
    try {
      await provider.send(phone, message);
      logger.info(`OTP SMS sent via ${provider.name}`, { phone: maskPhone(phone) });
      return;
    } catch (err) {
      const msg = (err as Error).message;
      errors.push(`${provider.name}: ${msg}`);
      logger.warn(`${provider.name} SMS send failed, trying next provider`, { phone: maskPhone(phone), error: msg });
    }
  }
  logger.error('All SMS providers failed or unconfigured', { phone: maskPhone(phone), errors });
  throw new Error('OTP service unavailable. Please try again shortly.');
}
