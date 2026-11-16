/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { BILLING_RECORD_NOTICE, billingRecordFileName, createBillingRecordPdf, type BillingRecord } from './billingRecordPdf.ts';

// Synthetic records only; fees match the approved PHP 95 per-animal schedule.
const now = new Date('2026-10-25T07:42:00Z'); // 2026-10-25 15:42 (Manila)
const unpaid: BillingRecord = { id: 'AINV-0123456789abcdef', vendor_id: 'VEN-SYN-1', vendor_name: 'Synthetic Meat Stall',
  animalIdentifier: 'PIG-0042', date_issued: '2026-10-20', due_date: '2026-10-30', payment_status: 'Unpaid',
  totalCents: 9500, paidCents: 0, balanceCents: 9500, corral_fee: 15, delivery_fee: 25, anti_mortem_fee: 10, facility_fee: 45 };
const paid: BillingRecord = { ...unpaid, payment_status: 'Paid', paidCents: 9500, balanceCents: 0,
  payment: { receiptReference: 'OR-SYN-77', amountCents: 9500, method: 'cash', recordedAt: '2026-10-21T01:05:00Z' } };

// jsPDF writes each line as a "(text) Tj" operator; collect them, undoing PDF string escapes.
const text = (record: BillingRecord) => [...createBillingRecordPdf(record, now).output().matchAll(/\(((?:\\[\s\S]|[^\\)])*)\) Tj/g)]
  .map(match => match[1].replace(/\\([\\()])/g, '$1')).join('\n');

test('paid invoice exports a payment record with the receipt reference and the not-official notice', () => {
  const out = text(paid);
  for (const expected of ['Electronic payment record', 'NOT AN OFFICIAL RECEIPT', 'AINV-0123456789abcdef', 'Synthetic Meat Stall (VEN-SYN-1)',
    'PIG-0042', 'Oct 20, 2026', 'Oct 30, 2026', 'Paper official-receipt', 'OR-SYN-77', '2026-10-21 09:05 (Manila)',
    'PHP 15.00', 'PHP 25.00', 'PHP 10.00', 'PHP 45.00', 'PHP 95.00', 'PHP 0.00', 'Page 1 of 1', 'Generated 2026-10-25 15:42 (Manila)'])
    assert.ok(out.includes(expected), `missing: ${expected}`);
  assert.ok(out.replace(/\n/g, ' ').includes(BILLING_RECORD_NOTICE.slice(0, 60)));
  for (const label of ['Corral', 'Delivery', 'Inspection', 'Facility']) assert.ok(out.includes(label));
});

test('unpaid invoice exports a billing statement, never a payment record', () => {
  const out = text(unpaid);
  assert.ok(out.includes('Billing statement'));
  assert.ok(!out.includes('Electronic payment record'));
  assert.ok(out.includes('No payment recorded.'));
  assert.ok(out.includes('Unpaid'));
});

test('unpaid after the Manila due date shows the overdue flag', () => {
  assert.ok(text({ ...unpaid, due_date: '2026-10-24' }).includes('Overdue (unpaid after due date)'));
});

test('missing stored fees show Unavailable, never zero', () => {
  const { corral_fee: _omit, ...rest } = unpaid;
  const out = text(rest);
  assert.ok(out.includes('Unavailable'));
});

test('calculated carcass basis is labelled as calculated, not measured', () => {
  const out = text({ ...paid, carcassBasis: { method: 'calculated_80_percent', liveWeightGrams: 100000, carcassWeightGrams: 80000, animalRevision: 2, factor: 0.8 } });
  assert.ok(out.includes('Calculated carcass weight'));
  assert.ok(out.includes('Not scale-measured'));
});

test('synthetic rehearsal invoices are marked', () => {
  assert.ok(text({ ...unpaid, syntheticOnly: true }).includes('SYNTHETIC REHEARSAL INVOICE'));
});

test('inconsistent or incomplete records are refused instead of exported', () => {
  assert.throws(() => createBillingRecordPdf({ ...unpaid, balanceCents: 100 }, now), /balance requires review/);
  assert.throws(() => createBillingRecordPdf({ ...paid, payment: undefined }, now), /Payment reference details are unavailable/);
});

test('unsupported characters fail instead of being replaced', () => {
  assert.throws(() => createBillingRecordPdf({ ...unpaid, vendor_name: 'Stall 市場' }, now), /unsupported text/);
});

test('long vendor names wrap inside the page', () => {
  const pdf = createBillingRecordPdf({ ...paid, vendor_name: 'Synthetic Cooperative Association '.repeat(6).trim() }, now);
  assert.equal(pdf.getNumberOfPages(), 1);
  const width = pdf.internal.pageSize.getWidth();
  for (const match of pdf.output().matchAll(/([-\d.]+) ([-\d.]+) Td\n\(((?:\\[\s\S]|[^\\)])*)\) Tj/g)) {
    const x = Number(match[1]) / pdf.internal.scaleFactor;
    assert.ok(x >= 14.9 && x < width - 15, `outside page: ${match[3]}`);
  }
});

test('bold labels wrap within their column instead of running into the value', () => {
  const pdf = createBillingRecordPdf(paid, now);
  const labelColumnEnd = 15 + 52 - 3; // margin + label column width - gap before the value column (mm)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
  for (const match of pdf.output().matchAll(/([-\d.]+) [-\d.]+ Td\n\(((?:\\[\s\S]|[^\\)])*)\) Tj/g)) {
    const x = Number(match[1]) / pdf.internal.scaleFactor, label = match[2].replace(/\\([\\()])/g, '$1');
    if (Math.abs(x - 15) < 0.1 && /^(Paper|official|reference|Bill reference|Weight basis)/.test(label))
      assert.ok(x + pdf.getTextWidth(label) <= labelColumnEnd, `label overflows its column: ${label}`);
  }
});

test('file names are safe and say what the document is', () => {
  assert.equal(billingRecordFileName(paid), 'AINV-0123456789abcdef-payment-record.pdf');
  assert.equal(billingRecordFileName({ id: 'AINV/../x y', payment_status: 'Unpaid' }), 'AINV____x_y-billing-statement.pdf');
});
