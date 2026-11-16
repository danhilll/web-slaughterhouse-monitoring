import { dayText } from './displayTime.ts';
import { paymentState } from './overdue.ts';
import { normalize, searchTerms } from './searchText.ts';

// Client-side search over invoices already returned to this authorized screen. It never queries
// the server and never treats a partly loaded register as complete; the page states what was searched.
export type SearchableInvoice = {
  id: string; vendor_id: string; vendor_name: string; animalIdentifier: string;
  date_issued: string; due_date: string; payment_status: string; payment?: { receiptReference: string };
};

// Status words match the displayed status exactly, so "paid" does not also match "Unpaid".
// Overdue is still unpaid (a flag only), so "unpaid" includes Overdue invoices.
const statusTerms: Record<string, string[]> = { paid: ['Paid'], unpaid: ['Unpaid', 'Overdue'], overdue: ['Overdue'] };

export const billingSearchTerms = searchTerms;

/** Every term must match (AND): vendor, vendor ID, animal, AINV reference, receipt reference, dates or status. */
export function matchesBillingSearch(invoice: SearchableInvoice, terms: string[], now = new Date()): boolean {
  if (!terms.length) return true;
  const state = paymentState(invoice, now);
  const text = normalize([invoice.vendor_name, invoice.vendor_id, invoice.animalIdentifier, invoice.id,
    invoice.payment?.receiptReference, invoice.date_issued, invoice.due_date,
    dayText(invoice.date_issued), dayText(invoice.due_date)]
    .filter((value): value is string => typeof value === 'string').join(' '));
  return terms.every(term => statusTerms[term] ? state !== null && statusTerms[term].includes(state) : text.includes(term));
}
