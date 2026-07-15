import twilio from 'twilio';
import axios from 'axios';
import logger from '../utils/logger';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

function maskPhone(phone: string): string {
  return `${phone.substring(0, 4)}****${phone.slice(-3)}`;
}

export async function sendOTP(phone: string): Promise<void> {
  try {
    await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
      .verifications.create({ to: phone, channel: 'sms' });
    logger.info('OTP sent via Twilio', { phone: maskPhone(phone) });
    return;
  } catch (err) {
    logger.warn('Twilio OTP failed, falling back to Termii', {
      phone: maskPhone(phone),
      error: (err as Error).message
    });
  }

  // Termii fallback
  try {
    await axios.post(
      'https://api.ng.termii.com/api/sms/otp/send',
      {
        api_key: process.env.TERMII_API_KEY,
        message_type: 'NUMERIC',
        to: phone,
        from: process.env.TERMII_SENDER_ID ?? 'VerifyAfrica',
        channel: 'dnd',
        pin_attempts: 3,
        pin_time_to_live: 5,
        pin_length: 6,
        pin_placeholder: '< 1234 >',
        message_text: 'Your VerifyAfrica code is < 1234 >. Valid 5 mins. Do not share.',
        pin_type: 'NUMERIC'
      },
      { timeout: 10000 }
    );
    logger.info('OTP sent via Termii', { phone: maskPhone(phone) });
  } catch (err) {
    logger.error('All OTP providers failed', { phone: maskPhone(phone), error: (err as Error).message });
    throw new Error('OTP service unavailable. Please try again shortly.');
  }
}

export async function verifyOTP(phone: string, code: string): Promise<boolean> {
  try {
    const check = await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
      .verificationChecks.create({ to: phone, code });
    return check.status === 'approved';
  } catch (err) {
    logger.error('Twilio OTP check failed', { error: (err as Error).message });
    return false;
  }
}
