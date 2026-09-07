import { Resend } from 'resend';
import logger from '../utils/logger';

// The email-delivery counterpart to otp.service.ts's sendSms. Single
// provider (Resend) rather than the SMS side's multi-provider fallback -
// email delivery doesn't have the same regional-carrier reliability problem
// SMS does in this market, so one well-tested provider is enough.

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error('Email OTP not configured');
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: [email],
    subject: 'Your AfriVerify verification code',
    html: renderOtpEmail(code),
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
  logger.info('OTP email sent', { email: maskEmail(email) });
}

// Same dark/gold branded layout Sankofa's own transactional emails use -
// table-based markup and inlined styles, since email clients don't load
// external stylesheets.
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderOtpEmail(code: string): string {
  return `
  <div style="background-color:#070707;padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
      <tr><td style="background-color:#c9960e;height:4px;border-radius:8px 8px 0 0;"></td></tr>
      <tr>
        <td style="background-color:#0f0f0f;border-radius:0 0 8px 8px;padding:32px 24px;text-align:center;">
          <div style="font-family:Arial,Helvetica,sans-serif;color:#c9960e;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;margin-bottom:18px;">Verification Code</div>
          <div style="font-family:Arial,Helvetica,sans-serif;color:#ede8de;font-size:32px;font-weight:bold;letter-spacing:6px;margin-bottom:18px;">${escapeHtml(code)}</div>
          <div style="height:1px;background-color:#1d1d1d;margin:0 0 18px;"></div>
          <div style="font-family:Arial,Helvetica,sans-serif;color:#8a8a8a;font-size:13px;">This code expires in 5 minutes. If you didn't request this, you can ignore this email.</div>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 4px 0;text-align:center;font-family:Arial,Helvetica,sans-serif;color:#5a5a5a;font-size:11px;">
          AfriVerify &middot; afriverify.sankofaapp.com
        </td>
      </tr>
    </table>
  </div>`;
}
