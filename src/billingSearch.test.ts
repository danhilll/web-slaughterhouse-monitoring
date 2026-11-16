/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { billingSearchTerms, matchesBillingSearch, type SearchableInvoice } from './billingSearch.ts';

// Synthetic records only.
const now = new Date('2026-10-25T04:00:00Z'); // 2026-10-25 12:00 (Manila)
const base: SearchableInvoice = { id: 'AINV-abc123', vendor_id: 'VEN-SYN-1', vendor_name: 'Synthetic Meat Stall',
  animalIdentifier: 'PIG-0042', date_issued: '2026-10-20', due_date: '2026-10-30', payment_status: 'Unpaid' };
const paid = { ...base, id: 'AINV-def456', payment_status: 'Paid', payment: { receiptReference: 'OR-SYN-77' } };
const overdue = { ...base, id: 'AINV-ghi789', due_date: '2026-10-24' };
const find = (query: string, rows: SearchableInvoice[]) => rows.filter(row => matchesBillingSearch(row, billingSearchTerms(query), now)).map(row => row.id);

test('empty or whitespace query matches every invoice', () => {
  assert.deepEqual(find('   ', [base, paid]), [base.id, paid.id]);
});

test('matches vendor, animal, AINV, vendor ID and receipt reference, case-insensitively', () => {
  const rows = [base, paid];
  assert.deepEqual(find('synthetic MEAT', rows), [base.id, paid.id]);
  assert.deepEqual(find('pig-0042', rows), [base.id, paid.id]);
  assert.deepEqual(find('ainv-def', rows), [paid.id]);
  assert.deepEqual(find('ven-syn-1', rows), [base.id, paid.id]);
  assert.deepEqual(find('or-syn-77', rows), [paid.id]);
});

test('all terms must match', () => {
  assert.deepEqual(find('synthetic or-syn-77', [base, paid]), [paid.id]);
  assert.deepEqual(find('synthetic nothing-here', [base, paid]), []);
});

test('matches raw and displayed dates', () => {
  assert.deepEqual(find('2026-10-20', [base]), [base.id]);
  assert.deepEqual(find('oct 20', [base]), [base.id]);
});

test('status words match the displayed status exactly, using the Manila-day overdue rule', () => {
  const rows = [base, paid, overdue];
  assert.deepEqual(find('paid', rows), [paid.id], '"paid" must not match Unpaid');
  assert.deepEqual(find('overdue', rows), [overdue.id]);
  assert.deepEqual(find('unpaid', rows), [base.id, overdue.id], 'Overdue is still unpaid');
});

test('unknown payment status never matches a status word', () => {
  assert.deepEqual(find('unpaid', [{ ...base, payment_status: 'Mystery' }]), []);
});
