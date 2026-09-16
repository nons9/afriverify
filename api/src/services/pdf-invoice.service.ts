import PDFDocument from 'pdfkit';

export interface InvoiceData {
  invoiceNumber: string;
  status: string;
  createdAt: Date;
  paidAt: Date | null;
  periodStart: Date;
  periodEnd: Date;
  developerEmail: string;
  platformName: string;
  plan: string;
  currency: string;
  amountCents: number;
  overageVerifications: number;
  overageAmountCents: number;
  totalAmountCents: number;
  verificationsIncluded: number;
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function generateInvoicePdf(inv: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const GOLD = '#c9960e';
    const DARK = '#111111';
    const MUTED = '#555555';
    const W = 495; // usable width

    // ── Gold header bar ──────────────────────────────────────────────────
    doc.rect(50, 50, W, 4).fill(GOLD);

    // ── Brand + invoice meta ─────────────────────────────────────────────
    doc.moveDown(1.2);
    doc.fontSize(22).fillColor(DARK).font('Helvetica-Bold').text('AfriVerify', 50, 70);
    doc.fontSize(9).fillColor(MUTED).font('Helvetica').text('afriverify.sankofaapp.com', 50, 96);

    // Right-aligned invoice number
    doc.fontSize(9).fillColor(MUTED).font('Helvetica').text('INVOICE', 350, 70, { width: 195, align: 'right' });
    doc.fontSize(18).fillColor(DARK).font('Helvetica-Bold').text(inv.invoiceNumber, 350, 84, { width: 195, align: 'right' });
    doc.fontSize(9).fillColor(MUTED).font('Helvetica').text(`Issued: ${fmtDate(inv.createdAt)}`, 350, 108, { width: 195, align: 'right' });
    if (inv.paidAt) {
      doc.text(`Paid: ${fmtDate(inv.paidAt)}`, 350, 121, { width: 195, align: 'right' });
    }

    // ── Divider ───────────────────────────────────────────────────────────
    doc.moveTo(50, 140).lineTo(545, 140).strokeColor('#e5e5e5').lineWidth(1).stroke();

    // ── Billing info row ─────────────────────────────────────────────────
    doc.fontSize(8).fillColor(MUTED).font('Helvetica-Bold')
       .text('BILLED TO', 50, 158)
       .text('BILLING PERIOD', 220, 158)
       .text('STATUS', 400, 158);

    doc.fontSize(10).fillColor(DARK).font('Helvetica')
       .text(inv.developerEmail, 50, 172)
       .text(inv.platformName, 50, 186, { width: 150 });

    doc.fontSize(10).fillColor(DARK).font('Helvetica')
       .text(`${fmtDate(inv.periodStart)} –`, 220, 172)
       .text(fmtDate(inv.periodEnd), 220, 186);

    const statusColor = inv.status === 'paid' ? '#065f46' : '#92400e';
    const statusBg   = inv.status === 'paid' ? '#d1fae5' : '#fef3c7';
    doc.roundedRect(400, 168, 60, 18, 4).fill(statusBg);
    doc.fontSize(9).fillColor(statusColor).font('Helvetica-Bold')
       .text(inv.status.toUpperCase(), 400, 173, { width: 60, align: 'center' });

    // ── Table header ──────────────────────────────────────────────────────
    const tableTop = 225;
    doc.rect(50, tableTop, W, 24).fill('#f5f5f5');
    doc.fontSize(9).fillColor(MUTED).font('Helvetica-Bold')
       .text('DESCRIPTION', 58, tableTop + 8)
       .text('DETAILS', 280, tableTop + 8)
       .text('AMOUNT', 450, tableTop + 8, { width: 90, align: 'right' });

    // ── Line items ────────────────────────────────────────────────────────
    let y = tableTop + 36;
    const planLabel = inv.plan.charAt(0).toUpperCase() + inv.plan.slice(1);

    if (inv.amountCents > 0 || inv.verificationsIncluded > 0) {
      doc.fontSize(10).fillColor(DARK).font('Helvetica')
         .text(`Subscription — ${planLabel} plan`, 58, y)
         .text(`${inv.verificationsIncluded.toLocaleString()} verifications included`, 280, y)
         .text(fmt(inv.amountCents), 450, y, { width: 90, align: 'right' });
      doc.moveTo(50, y + 22).lineTo(545, y + 22).strokeColor('#eeeeee').lineWidth(0.5).stroke();
      y += 30;
    }

    if (inv.overageVerifications > 0) {
      doc.fontSize(10).fillColor(DARK).font('Helvetica')
         .text('Usage overage', 58, y)
         .text(`${inv.overageVerifications.toLocaleString()} × $0.03`, 280, y)
         .text(fmt(inv.overageAmountCents), 450, y, { width: 90, align: 'right' });
      doc.moveTo(50, y + 22).lineTo(545, y + 22).strokeColor('#eeeeee').lineWidth(0.5).stroke();
      y += 30;
    }

    // ── Total row ─────────────────────────────────────────────────────────
    y += 6;
    doc.moveTo(50, y).lineTo(545, y).strokeColor(DARK).lineWidth(1.5).stroke();
    y += 12;
    doc.fontSize(12).fillColor(DARK).font('Helvetica-Bold')
       .text('Total', 58, y)
       .text(`${fmt(inv.totalAmountCents)} ${inv.currency}`, 450, y, { width: 90, align: 'right' });

    // ── Footer note ───────────────────────────────────────────────────────
    doc.fontSize(9).fillColor(MUTED).font('Helvetica')
       .text(
         'Thank you for using AfriVerify. Questions? Contact billing@sankofaapp.com.',
         50, y + 50, { width: W }
       );

    doc.end();
  });
}
