import { Resend } from 'resend';
import logger from '../utils/logger';

function resendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error('Resend not configured');
  return new Resend(apiKey);
}

function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? 'noreply@afriverify.sankofaapp.com';
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function emailWrapper(title: string, body: string): string {
  return `
<div style="background-color:#070707;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
    <tr><td style="background-color:#c9960e;height:4px;border-radius:8px 8px 0 0;"></td></tr>
    <tr>
      <td style="background-color:#0f0f0f;border-radius:0 0 8px 8px;padding:32px 28px;">
        <div style="color:#c9960e;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;margin-bottom:20px;">AfriVerify</div>
        <div style="color:#ede8de;font-size:20px;font-weight:bold;margin-bottom:16px;">${escapeHtml(title)}</div>
        ${body}
        <div style="height:1px;background:#1d1d1d;margin:24px 0;"></div>
        <div style="color:#5a5a5a;font-size:11px;">AfriVerify &middot; afriverify.sankofaapp.com</div>
      </td>
    </tr>
  </table>
</div>`;
}

export async function sendUsageAlertEmail(params: {
  email: string;
  platformName: string;
  used: number;
  limit: number;
  plan: string;
  periodEnd: Date;
}): Promise<void> {
  const { email, platformName, used, limit, plan, periodEnd } = params;
  const pct = Math.round((used / limit) * 100);
  const remaining = Math.max(0, limit - used);
  const client = resendClient();

  const body = `
<p style="color:#a8a8a8;font-size:14px;line-height:1.6;margin:0 0 16px;">
  Your API key <strong style="color:#ede8de;">${escapeHtml(platformName)}</strong> has used
  <strong style="color:#f59e0b;">${pct}%</strong> of its monthly quota.
</p>
<div style="background:#1a1a1a;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="color:#8a8a8a;font-size:13px;padding:4px 0;">Plan</td>
      <td style="color:#ede8de;font-size:13px;text-align:right;font-weight:bold;padding:4px 0;">${escapeHtml(plan.charAt(0).toUpperCase() + plan.slice(1))}</td>
    </tr>
    <tr>
      <td style="color:#8a8a8a;font-size:13px;padding:4px 0;">Verifications used</td>
      <td style="color:#ede8de;font-size:13px;text-align:right;font-weight:bold;padding:4px 0;">${used.toLocaleString()} / ${limit.toLocaleString()}</td>
    </tr>
    <tr>
      <td style="color:#8a8a8a;font-size:13px;padding:4px 0;">Remaining</td>
      <td style="color:#f59e0b;font-size:13px;text-align:right;font-weight:bold;padding:4px 0;">${remaining.toLocaleString()}</td>
    </tr>
    <tr>
      <td style="color:#8a8a8a;font-size:13px;padding:4px 0;">Period ends</td>
      <td style="color:#ede8de;font-size:13px;text-align:right;padding:4px 0;">${periodEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
    </tr>
  </table>
</div>
<p style="color:#a8a8a8;font-size:13px;line-height:1.6;margin:0 0 16px;">
  Usage beyond your plan limit is billed at <strong style="color:#ede8de;">$0.03 per verification</strong>.
  Upgrade to a higher plan to get a better per-verification rate.
</p>
<a href="https://afriverify.sankofaapp.com/dashboard/usage"
   style="display:inline-block;background:#c9960e;color:#000;font-weight:bold;font-size:13px;padding:10px 20px;border-radius:6px;text-decoration:none;">
  View Usage &amp; Upgrade
</a>`;

  const { error } = await client.emails.send({
    from: fromAddress(),
    to: [email],
    subject: `[AfriVerify] You've used ${pct}% of your monthly quota`,
    html: emailWrapper('Quota Usage Alert', body),
  });
  if (error) throw new Error(`Failed to send usage alert: ${error.message}`);
  logger.info('Usage alert email sent', { email, pct });
}

export async function sendOverageInvoiceEmail(params: {
  email: string;
  platformName: string;
  invoiceNumber: string;
  overageVerifications: number;
  overageAmountCents: number;
  period: string;
}): Promise<void> {
  const { email, platformName, invoiceNumber, overageVerifications, overageAmountCents, period } = params;
  const client = resendClient();

  const body = `
<p style="color:#a8a8a8;font-size:14px;line-height:1.6;margin:0 0 16px;">
  An overage invoice has been generated for <strong style="color:#ede8de;">${escapeHtml(platformName)}</strong>.
</p>
<div style="background:#1a1a1a;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="color:#8a8a8a;font-size:13px;padding:4px 0;">Invoice</td>
      <td style="color:#ede8de;font-size:13px;text-align:right;font-weight:bold;padding:4px 0;">${escapeHtml(invoiceNumber)}</td>
    </tr>
    <tr>
      <td style="color:#8a8a8a;font-size:13px;padding:4px 0;">Billing period</td>
      <td style="color:#ede8de;font-size:13px;text-align:right;padding:4px 0;">${escapeHtml(period)}</td>
    </tr>
    <tr>
      <td style="color:#8a8a8a;font-size:13px;padding:4px 0;">Overage verifications</td>
      <td style="color:#ede8de;font-size:13px;text-align:right;padding:4px 0;">${overageVerifications.toLocaleString()}</td>
    </tr>
    <tr>
      <td style="color:#8a8a8a;font-size:13px;padding:4px 0;">Rate</td>
      <td style="color:#ede8de;font-size:13px;text-align:right;padding:4px 0;">$0.03 per verification</td>
    </tr>
    <tr>
      <td style="color:#8a8a8a;font-size:13px;padding:8px 0 0;border-top:1px solid #2a2a2a;">Total due</td>
      <td style="color:#c9960e;font-size:15px;font-weight:bold;text-align:right;padding:8px 0 0;border-top:1px solid #2a2a2a;">$${(overageAmountCents / 100).toFixed(2)} USD</td>
    </tr>
  </table>
</div>
<a href="https://afriverify.sankofaapp.com/dashboard/usage"
   style="display:inline-block;background:#c9960e;color:#000;font-weight:bold;font-size:13px;padding:10px 20px;border-radius:6px;text-decoration:none;">
  View Invoice
</a>`;

  const { error } = await client.emails.send({
    from: fromAddress(),
    to: [email],
    subject: `[AfriVerify] Overage invoice ${invoiceNumber} — $${(overageAmountCents / 100).toFixed(2)} due`,
    html: emailWrapper('Overage Invoice', body),
  });
  if (error) throw new Error(`Failed to send overage invoice email: ${error.message}`);
  logger.info('Overage invoice email sent', { email, invoiceNumber });
}

export async function sendSubscriptionPastDueEmail(params: {
  email: string;
  platformName: string;
  plan: string;
  gracePeriodEndDate: Date;
}): Promise<void> {
  const { email, platformName, plan, gracePeriodEndDate } = params;
  const client = resendClient();

  const body = `
<p style="color:#a8a8a8;font-size:14px;line-height:1.6;margin:0 0 16px;">
  Your <strong style="color:#ede8de;">${escapeHtml(plan.charAt(0).toUpperCase() + plan.slice(1))}</strong> subscription
  for <strong style="color:#ede8de;">${escapeHtml(platformName)}</strong> has expired and no renewal payment was received.
</p>
<p style="color:#a8a8a8;font-size:13px;line-height:1.6;margin:0 0 16px;">
  Your key will continue working until <strong style="color:#ef4444;">${gracePeriodEndDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>,
  after which it will be downgraded to the free tier (100 verifications/month).
</p>
<a href="https://afriverify.sankofaapp.com/dashboard/usage"
   style="display:inline-block;background:#c9960e;color:#000;font-weight:bold;font-size:13px;padding:10px 20px;border-radius:6px;text-decoration:none;">
  Renew Now
</a>`;

  const { error } = await client.emails.send({
    from: fromAddress(),
    to: [email],
    subject: `[AfriVerify] Action needed: renew your ${plan} plan`,
    html: emailWrapper('Subscription Expired', body),
  });
  if (error) throw new Error(`Failed to send past due email: ${error.message}`);
  logger.info('Subscription past due email sent', { email, plan });
}
