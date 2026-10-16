import { jsPDF } from 'jspdf';
import { invoiceHeadcountLines, readAmount, validDay } from '../shared/reporting.js';
import type { Invoice, Vendor } from './types';

export const PDF_EXPORT_LIMITATION = 'PDF export supports Latin/WinAnsi text only. CJK, Arabic and emoji are not supported. No PDF was downloaded; the original text remains available on screen.';
export const INVOICE_COPY_NOTICE = 'Historical record copy; not an official receipt. Official fees, numbering, payment terms and correction policies await approval.';
// Additional printable characters in jsPDF 4.2.1 Helvetica's WinAnsi encoding map.
const winAnsiExtras = new Set('ŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™');

function verifyText(label: string, value: string) {
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (char === '\n' || char === '\r' || code >= 32 && code <= 126 ||
        code >= 161 && code <= 255 && code !== 173 || winAnsiExtras.has(char)) continue;
    throw new Error(`${label} contains unsupported text (U+${code.toString(16).toUpperCase().padStart(4, '0')}). ${PDF_EXPORT_LIMITATION}`);
  }
}

const dateText = (value: string) => validDay(value)
  ? `${value.slice(5, 7)}/${value.slice(8, 10)}/${value.slice(0, 4)}`
  : value || 'Unavailable (not recorded)';
const money = (value: unknown) => readAmount(value) === null ? 'Unavailable (missing/invalid)'
  : `PHP ${new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value as number)}`;

/** Uses only the supplied invoice and matching business already returned to this authorized screen. */
export function createInvoicePdf(invoice: Invoice, options: {
  municipalityName: string;
  business?: Pick<Vendor, 'id' | 'address'>;
}): jsPDF {
  if (options.business && options.business.id !== invoice.vendor_id)
    throw new Error('The returned business does not match this invoice. PDF export is unavailable.');
  const address = options.business?.address || 'Unavailable (not returned for this business)';
  const name = invoice.vendor_name || 'Unavailable (not recorded)';
  const notes = invoice.notes || 'Not recorded';
  // Validate every exported field before building a document; never strip or replace unsupported text.
  for (const [label, value] of Object.entries({ Municipality: options.municipalityName,
    'Invoice ID': invoice.id, Vendor: name, 'Business address': address, Notes: notes,
    'Issue date': dateText(invoice.date_issued), 'Due date': dateText(invoice.due_date),
    'Payment status': invoice.payment_status })) verifyText(label, value);

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.setLineHeightFactor(1.3);
  const margin = 15, width = pdf.internal.pageSize.getWidth() - 2 * margin;
  const pageHeight = pdf.internal.pageSize.getHeight(), bottom = pageHeight - 40;
  let y = margin;
  function font(size = 11, bold = false) { pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size); }
  function height() { return pdf.getLineHeight() / pdf.internal.scaleFactor; }
  function lines(text: string): string[] {
    // Keep explicit paragraph breaks; wrapping changes layout, not stored text.
    return text.replace(/\r\n?/g, '\n').split('\n').flatMap(line => line ? pdf.splitTextToSize(line, width) : ['']);
  }
  function line(text: string) { pdf.text(text, margin, y, { baseline: 'top' }); y += height(); }
  function header() {
    y = margin;
    font(10);
    const municipality = lines(`Municipal Government of ${options.municipalityName}`);
    font(13, true);
    const title = lines('Invoice record - Slaughterhouse Service Fees');
    font(9);
    const identifier = lines(`Invoice #: ${invoice.id}`);
    // Repeated headings must leave space for content. Fail explicitly rather than clipping a heading.
    if (municipality.length * 5 + title.length * 6 + identifier.length * 5 > 60)
      throw new Error('Municipality or invoice ID is too long for a readable PDF heading. No PDF was downloaded.');
    font(10); municipality.forEach(line);
    font(13, true); title.forEach(line);
    y += 2; font(9); identifier.forEach(line);
    y += 4;
    pdf.setDrawColor(180); pdf.line(margin, y - 2, margin + width, y - 2);
  }
  function nextPage() { pdf.addPage(); header(); }
  function paragraph(text: string, size = 11, bold = false, continuation?: string) {
    font(size, bold);
    for (const value of lines(text)) {
      if (y + height() > bottom) {
        nextPage();
        if (continuation) { font(10, true); line(continuation); y += 2; }
        font(size, bold);
      }
      line(value);
    }
    y += 3;
  }

  header();
  paragraph(`Vendor: ${name}`, 11, false, 'Business details (continued)');
  paragraph(`Business address (current authorized record): ${address}`, 10, false, 'Business address (continued)');
  paragraph(`Date Issued: ${dateText(invoice.date_issued)}   Due: ${dateText(invoice.due_date)}`, 10);
  for (const value of invoiceHeadcountLines(invoice)) paragraph(value, 10);
  // The heading and first notes line stay together; long notes continue across pages with context.
  font(10, true);
  if (y + height() * 2 + 3 > bottom) nextPage();
  paragraph('Recorded notes (not payment verification)', 10, true);
  paragraph(notes, 10, false, 'Recorded notes (continued; not payment verification)');

  const charges = [
    `Corral/Casket Fee: ${money(invoice.corral_fee)}`,
    `Delivery Fee: ${money(invoice.delivery_fee)}`,
    `Anti/Post Mortem Fee: ${money(invoice.anti_mortem_fee)}`,
    `Facility Fee: ${money(invoice.facility_fee)}`
  ];
  font(11);
  const chargesHeight = charges.reduce((sum, text) => sum + lines(text).length * height() + 3, 0);
  font(12, true);
  const total = `TOTAL: ${money(invoice.total_amount)}   [${invoice.payment_status}]`;
  const totalHeight = lines(total).length * height() + 3;
  // Financial summary stays together, away from notes and the reserved disclaimer/footer area.
  if (y + chargesHeight + totalHeight + 5 > bottom) nextPage();
  y += 2;
  pdf.setDrawColor(180); pdf.line(margin, y, margin + width, y); y += 3;
  for (const charge of charges) paragraph(charge);
  paragraph(total, 12, true);

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); y = bottom + 7; font(8);
    lines(INVOICE_COPY_NOTICE).forEach(line);
    pdf.text(`Page ${page} of ${pages}`, margin, pageHeight - margin, { baseline: 'bottom' });
  }
  return pdf;
}
