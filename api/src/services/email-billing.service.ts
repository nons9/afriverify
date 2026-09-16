import { Resend } from 'resend';
import logger from '../utils/logger';
import type { InvoiceData } from './pdf-invoice.service';

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
    subject: `[AfriVerify] Overage invoice ${invoiceNumber} - $${(overageAmountCents / 100).toFixed(2)} due`,
    html: emailWrapper('Overage Invoice', body),
  });
  if (error) throw new Error(`Failed to send overage invoice email: ${error.message}`);
  logger.info('Overage invoice email sent', { email, invoiceNumber });
}

export async function sendPurchaseConfirmationEmail(params: {
  inv: InvoiceData;
  pdfBuffer: Buffer;
}): Promise<void> {
  const { inv, pdfBuffer } = params;
  const client = resendClient();

  const fmt = (cents: number) =>
    `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const planLabel = inv.plan.charAt(0).toUpperCase() + inv.plan.slice(1);

  const rows: string[] = [];
  if (inv.amountCents > 0 || inv.verificationsIncluded > 0) {
    rows.push(`
    <tr>
      <td style="color:#a8a8a8;font-size:13px;padding:6px 0;">${escapeHtml(planLabel)} plan</td>
      <td style="color:#8a8a8a;font-size:12px;padding:6px 0;">${inv.verificationsIncluded.toLocaleString()} verifications</td>
      <td style="color:#ede8de;font-size:13px;font-weight:bold;text-align:right;padding:6px 0;">${fmt(inv.amountCents)}</td>
    </tr>`);
  }
  if (inv.overageVerifications > 0) {
    rows.push(`
    <tr>
      <td style="color:#a8a8a8;font-size:13px;padding:6px 0;">Usage overage</td>
      <td style="color:#8a8a8a;font-size:12px;padding:6px 0;">${inv.overageVerifications.toLocaleString()} × $0.03</td>
      <td style="color:#ede8de;font-size:13px;font-weight:bold;text-align:right;padding:6px 0;">${fmt(inv.overageAmountCents)}</td>
    </tr>`);
  }

  const body = `
<p style="color:#a8a8a8;font-size:14px;line-height:1.6;margin:0 0 16px;">
  Thank you - your payment has been received and your <strong style="color:#ede8de;">${escapeHtml(planLabel)}</strong> plan
  for <strong style="color:#ede8de;">${escapeHtml(inv.platformName)}</strong> is now active.
</p>
<div style="background:#1a1a1a;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="color:#8a8a8a;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;padding-bottom:10px;border-bottom:1px solid #2a2a2a;" colspan="3">Invoice ${escapeHtml(inv.invoiceNumber)}</td>
    </tr>
    ${rows.join('')}
    <tr>
      <td style="color:#ede8de;font-size:14px;font-weight:bold;padding:10px 0 0;border-top:1px solid #2a2a2a;" colspan="2">Total charged</td>
      <td style="color:#c9960e;font-size:16px;font-weight:bold;text-align:right;padding:10px 0 0;border-top:1px solid #2a2a2a;">${fmt(inv.totalAmountCents)} ${escapeHtml(inv.currency)}</td>
    </tr>
  </table>
</div>
<div style="background:#1a1a1a;border-radius:8px;padding:12px 20px;margin:0 0 20px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="color:#8a8a8a;font-size:13px;padding:3px 0;">Billing period</td>
      <td style="color:#ede8de;font-size:13px;text-align:right;padding:3px 0;">${fmtDate(inv.periodStart)} – ${fmtDate(inv.periodEnd)}</td>
    </tr>
    <tr>
      <td style="color:#8a8a8a;font-size:13px;padding:3px 0;">Monthly limit</td>
      <td style="color:#ede8de;font-size:13px;text-align:right;padding:3px 0;">${inv.verificationsIncluded.toLocaleString()} verifications</td>
    </tr>
  </table>
</div>
<p style="color:#6a6a6a;font-size:12px;line-height:1.6;margin:0 0 16px;">
  A PDF copy of your invoice is attached to this email. You can also view all invoices in your dashboard.
</p>
<a href="https://afriverify.sankofaapp.com/dashboard/usage"
   style="display:inline-block;background:#c9960e;color:#000;font-weight:bold;font-size:13px;padding:10px 20px;border-radius:6px;text-decoration:none;">
  View Dashboard
</a>`;

  const { error } = await client.emails.send({
    from: fromAddress(),
    to: [inv.developerEmail],
    subject: `[AfriVerify] Payment confirmed - ${escapeHtml(planLabel)} plan activated (${inv.invoiceNumber})`,
    html: emailWrapper('Payment Confirmed', body),
    attachments: [
      {
        filename: `${inv.invoiceNumber}.pdf`,
        content: pdfBuffer.toString('base64'),
      },
    ],
  });
  if (error) throw new Error(`Failed to send purchase confirmation email: ${error.message}`);
  logger.info('Purchase confirmation email sent', { email: inv.developerEmail, invoice: inv.invoiceNumber });
}

export async function sendWelcomeEmail(params: {
  email: string;
  fullName: string;
  companyName: string;
}): Promise<void> {
  const { email, fullName, companyName } = params;
  const client = resendClient();

  const body = `
<p style="color:#a8a8a8;font-size:14px;line-height:1.6;margin:0 0 16px;">
  Welcome to AfriVerify, <strong style="color:#ede8de;">${escapeHtml(fullName)}</strong>.
  Your account for <strong style="color:#ede8de;">${escapeHtml(companyName)}</strong> is ready.
</p>
<p style="color:#a8a8a8;font-size:13px;line-height:1.6;margin:0 0 20px;">
  To get started:
</p>
<div style="background:#1a1a1a;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
        <span style="color:#c9960e;font-weight:bold;font-size:13px;">1. </span>
        <span style="color:#ede8de;font-size:13px;">Create an API key in your dashboard</span>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
        <span style="color:#c9960e;font-weight:bold;font-size:13px;">2. </span>
        <span style="color:#ede8de;font-size:13px;">Read the integration docs to add identity verification to your app</span>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 0;">
        <span style="color:#c9960e;font-weight:bold;font-size:13px;">3. </span>
        <span style="color:#ede8de;font-size:13px;">Upgrade to a paid plan when you're ready to scale</span>
      </td>
    </tr>
  </table>
</div>
<p style="color:#6a6a6a;font-size:12px;line-height:1.6;margin:0 0 20px;">
  Your free tier includes 100 verifications/month. Starter ($49/mo) and Growth ($149/mo) plans are available when you need more.
</p>
<a href="https://afriverify.sankofaapp.com/dashboard"
   style="display:inline-block;background:#c9960e;color:#000;font-weight:bold;font-size:13px;padding:10px 20px;border-radius:6px;text-decoration:none;">
  Go to Dashboard
</a>`;

  const { error } = await client.emails.send({
    from: fromAddress(),
    to: [email],
    subject: '[AfriVerify] Welcome - your account is ready',
    html: emailWrapper('Welcome to AfriVerify', body),
  });
  if (error) throw new Error(`Failed to send welcome email: ${error.message}`);
  logger.info('Welcome email sent', { email });
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
