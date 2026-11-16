import { manilaDay } from './monitoringMetrics.ts';

// Read-only monitoring of owning-Vendor delivery ratings (owner decision 2026-11-16).
// Web never writes ratings. Comments are untrusted Vendor text: render as plain text only.
export type FeedbackRow = { id: string; invoiceId: string; vendorBusinessId: string; rating: number; comment: string | null; submittedAt: string };
export type RatingSummary = { count: number; average: number | null; distribution: [number, number, number, number, number]; excluded: number };

const validComment = (value: unknown) => value === null || typeof value === 'string' && value === value.trim() && value.length >= 1 && value.length <= 500 && !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(value);

/** Rejects the whole list on any malformed row; a partial or guessed rating is never shown. */
export function validateFeedbackRows(rows: unknown[]): FeedbackRow[] {
  for (const value of rows) {
    const r = value as FeedbackRow;
    if (!r || typeof r.id !== 'string' || r.id !== r.invoiceId || typeof r.vendorBusinessId !== 'string' || !Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5 ||
      !validComment(r.comment) || typeof r.submittedAt !== 'string' || !manilaDay(r.submittedAt)) throw Error('Delivery ratings require review; none are shown.');
  }
  return rows as FeedbackRow[];
}

/** Ratings submitted within [start, end) Manila days. Average is null (shown "Unavailable") when there are none, never 0. */
export function ratingSummary(rows: FeedbackRow[], bounds: [string, string]): RatingSummary {
  const distribution: RatingSummary['distribution'] = [0, 0, 0, 0, 0];
  let count = 0, total = 0, excluded = 0;
  for (const row of rows) {
    const day = manilaDay(row.submittedAt);
    if (!day) { excluded++; continue; }
    if (day < bounds[0] || day >= bounds[1]) continue;
    count++; total += row.rating; distribution[row.rating - 1]++;
  }
  return { count, average: count ? Math.round(total / count * 10) / 10 : null, distribution, excluded };
}

export const starsText = (rating: number) => `${rating} of 5 stars`;
