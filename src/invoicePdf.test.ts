/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvoicePdf, PDF_EXPORT_LIMITATION } from './invoicePdf.ts';
import type { Invoice } from './types';

const invoice: Invoice = { id: 'PDF-REGRESSION', vendor_id: 'BUSINESS-A', slaughter_record_id: null,
  vendor_name: 'Synthetic business', date_issued: '2026-10-17', due_date: '2026-10-18',
  number_of_heads_cow: 2, number_of_heads_pig: 3, corral_fee: 100, delivery_fee: 200,
  anti_mortem_fee: 300, facility_fee: 400, total_amount: 1000, payment_status: 'Unpaid' };
const options = { municipalityName: 'Calauag', business: { id: 'BUSINESS-A', address: 'Synthetic market address' } };
const unescape = (text: string) => text.replace(/\\([\\()])/g, '$1');
function pageRuns(pdf: ReturnType<typeof createInvoicePdf>) {
  const streams = [...pdf.output().matchAll(/stream\n([\s\S]*?)\nendstream/g)];
  return streams.map(stream => [...stream[1].matchAll(/BT\n([\s\S]*?)\nET/g)].map(block => {
    const position = block[1].match(/([-\d.]+) ([-\d.]+) Td/)!;
    const font = block[1].match(/\/F(\d+) ([\d.]+) Tf/)!;
    const text = block[1].match(/\(((?:\\[\s\S]|[^\\)])*)\) Tj/)![1];
    pdf.setFont('helvetica', font[1] === '2' ? 'bold' : 'normal'); pdf.setFontSize(Number(font[2]));
    return { text: unescape(text), x: Number(position[1]) / pdf.internal.scaleFactor,
      baseline: pdf.internal.pageSize.getHeight() - Number(position[2]) / pdf.internal.scaleFactor,
      width: pdf.getTextWidth(unescape(text)) };
  }));
}
function assertInsidePage(pdf: ReturnType<typeof createInvoicePdf>) {
  const pages = pageRuns(pdf), width = pdf.internal.pageSize.getWidth(), height = pdf.internal.pageSize.getHeight();
  for (const runs of pages) for (const run of runs) {
    assert.ok(run.x >= 14.9, `Left clip: ${run.text}`);
    assert.ok(run.x + run.width <= width - 14.5, `Right clip: ${run.text}`);
    assert.ok(run.baseline >= 15 && run.baseline <= height - 14.5, `Vertical clip: ${run.text}`);
  }
  return pages;
}

test('maximum supported name/address wrap without clipping or changing invoice data', () => {
  const row = { ...invoice, vendor_name: 'Synthetic Cooperative Association '.repeat(4).slice(0, 120) };
  const config = { ...options, business: { ...options.business, address: 'Synthetic Avenue, Calauag, Quezon; '.repeat(10).slice(0, 300) } };
  const before = structuredClone({ row, config });
  const pdf = createInvoicePdf(row, config), runs = assertInsidePage(pdf).flat();
  const text = runs.map(r => r.text).join(' ');
  assert.ok(text.includes(row.vendor_name.trim()));
  assert.ok(text.includes(config.business.address.trim()));
  assert.ok(text.includes('TOTAL: PHP 1,000.00   [Unpaid]'));
  assert.deepEqual({ row, config }, before);
});

test('wrapped notes paginate with repeated context, protected totals and disclaimer on every page', () => {
  const notes = Array.from({ length: 100 }, (_, i) => `NOTE-${String(i + 1).padStart(3, '0')}: ` +
    'Synthetic delivery instructions for the authorized market stall. '.repeat(3)).join('\n');
  const pdf = createInvoicePdf({ ...invoice, notes }, options), pages = assertInsidePage(pdf);
  assert.ok(pages.length >= 4);
  const text = pages.flat().map(r => r.text).join(' ');
  for (let i = 1; i <= 100; i++) assert.ok(text.includes(`NOTE-${String(i).padStart(3, '0')}:`));
  for (let i = 0; i < pages.length; i++) {
    const text = pages[i].map(r => r.text).join(' ');
    assert.ok(text.includes('Invoice #: PDF-REGRESSION'));
    assert.ok(text.includes('Historical record copy; not an official receipt.'));
    assert.ok(text.includes(`Page ${i + 1} of ${pages.length}`));
  }
  const summaryPages = pages.filter(runs => runs.some(r => r.text.startsWith('TOTAL:')));
  assert.equal(summaryPages.length, 1);
  const summary = summaryPages[0];
  for (const label of ['Corral/Casket Fee:', 'Delivery Fee:', 'Anti/Post Mortem Fee:', 'Facility Fee:'])
    assert.ok(summary.some(r => r.text.startsWith(label)));
  assert.ok(summary.filter(r => /Fee:|^TOTAL:/.test(r.text)).every(r => r.baseline < 257));
});

test('multiline names and unbroken long notes wrap and paginate without clipping', () => {
  const pdf = createInvoicePdf({ ...invoice,
    vendor_name: Array.from({ length: 85 }, (_, i) => `SYNTHETIC BUSINESS LINE ${i + 1}`).join('\n'),
    notes: 'LongUnbrokenNote'.repeat(100) }, options);
  const pages = assertInsidePage(pdf);
  assert.ok(pages.length >= 3);
  const text = pages.flat().map(r => r.text).join(' ');
  assert.ok(text.includes('SYNTHETIC BUSINESS LINE 85'));
  assert.ok(text.includes('TOTAL: PHP 1,000.00   [Unpaid]'));
});

test('notes do not change stored financial status; zero and unavailable amounts remain distinct', () => {
  for (const payment_status of ['Paid', 'Unpaid', 'Overdue'] as const) {
    const pdf = createInvoicePdf({ ...invoice, payment_status, notes: 'Paid in cash (unverified recorded note)',
      delivery_fee: 0 }, options);
    const text = pageRuns(pdf).flat().map(r => r.text).join(' ');
    assert.ok(text.includes(`TOTAL: PHP 1,000.00   [${payment_status}]`));
    assert.ok(text.includes('Delivery Fee: PHP 0.00'));
    assert.ok(text.includes('Recorded notes (not payment verification)'));
    assert.doesNotMatch(text, /SAME-DAY PAYMENT REQUIRED|No advance payment accepted|Treasurer Signature/);
  }
});

test('missing business/notes are explicit and mismatched business addresses are rejected', () => {
  const pdf = createInvoicePdf(invoice, { municipalityName: 'Calauag' });
  const text = pageRuns(pdf).flat().map(r => r.text).join(' ');
  assert.ok(text.includes('Unavailable (not returned for this business)'));
  assert.ok(text.includes('Not recorded'));
  const missing = pageRuns(createInvoicePdf({ ...invoice, corral_fee: NaN }, options)).flat().map(r => r.text).join(' ');
  assert.ok(missing.includes('Corral/Casket Fee: Unavailable (missing/invalid)'));
  assert.throws(() => createInvoicePdf(invoice, { ...options, business: { id: 'BUSINESS-B', address: 'Other business' } }), /does not match/);
});

test('unsupported scripts and control characters block export without corrupting stored fields', () => {
  for (const value of ['中文', 'العربية', '🐖', 'unsupported\tcontrol', 'nonbreaking\u00a0space']) {
    for (const field of ['vendor_name', 'notes'] as const) {
      const row = { ...invoice, [field]: value }, before = structuredClone(row);
      assert.throws(() => createInvoicePdf(row, options), error => error instanceof Error && error.message.includes(PDF_EXPORT_LIMITATION));
      assert.deepEqual(row, before);
    }
    assert.throws(() => createInvoicePdf(invoice, { ...options, business: { ...options.business, address: value } }), /unsupported text/);
  }
  const supported = createInvoicePdf({ ...invoice, vendor_name: 'Peña Muñoz café — “Market”', notes: 'Résumé • €10' }, options);
  assert.equal(supported.getNumberOfPages(), 1);
});
