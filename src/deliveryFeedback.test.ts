/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { ratingSummary, starsText, validateFeedbackRows, type FeedbackRow } from './deliveryFeedback.ts';

// Synthetic ratings only.
const row = (id: string, rating: number, submittedAt: string, comment: string | null = null): FeedbackRow =>
  ({ id, invoiceId: id, vendorBusinessId: 'VEN-SYN', rating, comment, submittedAt });

test('average and count use Asia/Manila day boundaries', () => {
  const rows = [
    row('AINV-1', 5, '2026-10-19T16:00:00Z'), // 2026-10-20 00:00 Manila: inside
    row('AINV-2', 4, '2026-10-26T15:59:00Z'), // 2026-10-26 23:59 Manila: inside
    row('AINV-3', 1, '2026-10-19T15:59:00Z'), // 2026-10-19 23:59 Manila: before
    row('AINV-4', 1, '2026-10-26T16:00:00Z'), // 2026-10-27 00:00 Manila: after
  ];
  assert.deepEqual(ratingSummary(rows, ['2026-10-20', '2026-10-27']), { count: 2, average: 4.5, distribution: [0, 0, 0, 1, 1], excluded: 0 });
});

test('no ratings in the period gives a null average, never zero', () => {
  assert.equal(ratingSummary([], ['2026-10-20', '2026-10-27']).average, null);
  assert.equal(ratingSummary([row('AINV-1', 3, '2026-09-01T00:00:00Z')], ['2026-10-20', '2026-10-27']).average, null);
});

test('average rounds to one decimal', () => {
  const rows = [row('A', 5, '2026-10-21T00:00:00Z'), row('B', 4, '2026-10-21T00:00:00Z'), row('C', 4, '2026-10-21T00:00:00Z')];
  assert.equal(ratingSummary(rows, ['2026-10-20', '2026-10-27']).average, 4.3);
});

test('malformed rows reject the whole list', () => {
  const good = row('AINV-1', 4, '2026-10-21T00:00:00Z', 'Fine');
  assert.deepEqual(validateFeedbackRows([good]), [good]);
  for (const patch of [{ rating: 0 }, { rating: 6 }, { rating: 4.5 }, { rating: '4' }, { comment: '' }, { comment: ' x' }, { comment: 'x'.repeat(501) }, { comment: 'a\tb' }, { submittedAt: 'yesterday' }, { invoiceId: 'AINV-OTHER' }])
    assert.throws(() => validateFeedbackRows([good, { ...good, ...patch }]), /require review/, JSON.stringify(patch));
});

test('star text', () => assert.equal(starsText(4), '4 of 5 stars'));
