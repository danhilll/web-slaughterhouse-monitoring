import { jsPDF } from 'jspdf';
import { carcassBasisText, type CarcassBasis } from './carcassBasis.ts';
import { dayText, manilaTime } from './displayTime.ts';
import { verifyText } from './invoicePdf.ts';
import { validateBillingAmounts } from './operationsWorkspace.ts';
import { paymentText } from './overdue.ts';

// Downloadable copy of one animal invoice exactly as the billing list returned it.
// Policy: AINV is an internal bill reference and never an official receipt; the paper
// official receipt (OR) recorded by Billing Staff remains the proof of payment.
export type BillingRecord = {
  id: string; vendor_id: string; vendor_name: string; animalIdentifier: string;
  date_issued: string; due_date: string; payment_status: string;
  totalCents: number; paidCents: number; balanceCents: number; syntheticOnly?: boolean;
  carcassBasis?: CarcassBasis;
  payment?: { receiptReference: string; amountCents: number; method: string; recordedAt: string };
  corral_fee?: number; delivery_fee?: number; anti_mortem_fee?: number; facility_fee?: number;
};

export const BILLING_RECORD_NOTICE = 'Not an official receipt. AINV is an internal bill reference. The paper official receipt issued by Billing Staff is the proof of payment.';

// Helvetica (WinAnsi) has no peso sign, so amounts use the "PHP" code.
const peso = (cents: number) => `PHP ${new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)}`;
const storedFee = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? peso(Math.round(value * 100)) : 'Unavailable';
const methodText = (method: string) => method === 'cash' ? 'Cash' : method === 'bank_transfer' ? 'Bank transfer' : method;

export function billingRecordFileName(invoice: { id: string; payment_status: string }): string {
  const safe = invoice.id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'invoice';
  return `${safe}-${invoice.payment_status === 'Paid' ? 'payment-record' : 'billing-statement'}.pdf`;
}

export function createBillingRecordPdf(invoice: BillingRecord, now = new Date()): jsPDF {
  // Same balance rules as the screen; an inconsistent record is never exported.
  validateBillingAmounts(invoice);
  const paid = invoice.payment_status === 'Paid';
  if (paid && !invoice.payment) throw new Error('Payment reference details are unavailable. Refresh and review before downloading.');
  const title = paid ? 'Electronic payment record' : 'Billing statement';

  const details: [string, string][] = [
    ['Bill reference (AINV)', invoice.id],
    ['Vendor', `${invoice.vendor_name} (${invoice.vendor_id})`],
    ['Animal', invoice.animalIdentifier],
    ['Issued', dayText(invoice.date_issued)],
    ['Due', dayText(invoice.due_date)],
    ['Status', paymentText(invoice, now)],
    ['Weight basis at issue', invoice.carcassBasis ? carcassBasisText(invoice.carcassBasis) : 'Not recorded on this earlier invoice.'],
  ];
  const charges: [string, string][] = [
    ['Corral', storedFee(invoice.corral_fee)], ['Delivery', storedFee(invoice.delivery_fee)],
    ['Inspection', storedFee(invoice.anti_mortem_fee)], ['Facility', storedFee(invoice.facility_fee)],
  ];
  const totals: [string, string][] = [['Total', peso(invoice.totalCents)], ['Recorded paid', peso(invoice.paidCents)], ['Balance', peso(invoice.balanceCents)]];
  const payment: [string, string][] = invoice.payment ? [
    ['Method', methodText(invoice.payment.method)],
    [invoice.payment.method === 'cash' ? 'Paper official-receipt reference' : 'Stored receipt reference', invoice.payment.receiptReference],
    ['Amount recorded', peso(invoice.payment.amountCents)],
    ['Recorded', manilaTime(invoice.payment.recordedAt)],
  ] : [['Payment', 'No payment recorded.']];
  const generated = `Generated ${manilaTime(now.toISOString())} from the municipal monitoring dashboard. It shows the records returned at that time; refresh after mobile activity.`;

  // Validate every exported string first; unsupported characters fail instead of being replaced.
  for (const [label, value] of [...details, ...charges, ...totals, ...payment]) verifyText(label, value);
  verifyText('Notice', BILLING_RECORD_NOTICE);

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.setLineHeightFactor(1.3);
  const margin = 15, width = pdf.internal.pageSize.getWidth() - 2 * margin, labelWidth = 52;
  const pageHeight = pdf.internal.pageSize.getHeight(), bottom = pageHeight - 36;
  let y = margin;
  const font = (size = 10, bold = false) => { pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size); };
  const lineHeight = () => pdf.getLineHeight() / pdf.internal.scaleFactor;
  const wrap = (text: string, w: number) => pdf.splitTextToSize(text, w) as string[];
  const header = () => {
    y = margin;
    font(10); pdf.text('Municipal Slaughterhouse', margin, y, { baseline: 'top' }); y += lineHeight();
    font(15, true); pdf.text(title, margin, y, { baseline: 'top' }); y += lineHeight();
    font(9, true); pdf.text('NOT AN OFFICIAL RECEIPT', margin, y, { baseline: 'top' }); y += lineHeight() + 2;
    pdf.setDrawColor(180); pdf.line(margin, y, margin + width, y); y += 4;
  };
  const ensure = (needed: number) => { if (y + needed > bottom) { pdf.addPage(); header(); } };
  const heading = (text: string) => { font(11, true); ensure(lineHeight() * 2 + 2); y += 2; pdf.text(text, margin, y, { baseline: 'top' }); y += lineHeight() + 1; };
  const row = ([label, value]: [string, string], bold = false) => {
    // Measure each column in the font it is drawn with, so bold labels never run into values.
    font(10, true); const labels = wrap(label, labelWidth - 3);
    font(10, bold); const values = wrap(value, width - labelWidth);
    const rows = Math.max(labels.length, values.length);
    for (let i = 0; i < rows; i++) {
      ensure(lineHeight());
      font(10, true); if (labels[i]) pdf.text(labels[i], margin, y, { baseline: 'top' });
      font(10, bold); if (values[i]) pdf.text(values[i], margin + labelWidth, y, { baseline: 'top' });
      y += lineHeight();
    }
    y += 1;
  };

  header();
  if (invoice.syntheticOnly) { font(10, true); ensure(lineHeight()); pdf.text('SYNTHETIC REHEARSAL INVOICE - not a real bill.', margin, y, { baseline: 'top' }); y += lineHeight() + 2; }
  heading('Invoice'); details.forEach(value => row(value));
  heading('Charges stored on this invoice'); charges.forEach(value => row(value));
  totals.forEach(value => row(value, true));
  heading('Payment'); payment.forEach(value => row(value));

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); y = bottom + 4; font(8);
    for (const text of [BILLING_RECORD_NOTICE, generated]) for (const line of wrap(text, width)) { pdf.text(line, margin, y, { baseline: 'top' }); y += lineHeight(); }
    pdf.text(`Page ${page} of ${pages}`, margin, pageHeight - margin, { baseline: 'bottom' });
  }
  return pdf;
}
