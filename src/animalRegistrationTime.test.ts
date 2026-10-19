import test from 'node:test';
import assert from 'node:assert/strict';
import { manilaWeighingInput, manilaWeighingTimeToUtc, displayManilaWeighingTime } from './animalRegistrationTime.ts';

for (const browserZone of ['UTC', 'Asia/Manila', 'America/Los_Angeles']) {
  test(`Manila live-weighing defaults and round trips ignore host timezone ${browserZone}`, () => {
    const previous = process.env.TZ;
    try {
      process.env.TZ = browserZone;
      const now = new Date('2026-10-19T17:30:45.123Z');
      assert.equal(manilaWeighingInput(now), '2026-10-20T01:30:45.123');
      assert.equal(manilaWeighingTimeToUtc(manilaWeighingInput(now)), now.toISOString());
      assert.equal(manilaWeighingTimeToUtc('2026-10-19T23:20'), '2026-10-19T15:20:00.000Z');
      assert.equal(displayManilaWeighingTime('2026-10-19T15:20:00Z'), '2026-10-19 23:20:00.000 (Asia/Manila, UTC+08:00)');
      assert.equal(manilaWeighingTimeToUtc('2024-02-29T00:01:02.5'), '2024-02-28T16:01:02.500Z');
    } finally {
      if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
    }
  });
}
test('Manila live-weighing input rejects normalized impossible dates and unsupported values', () => {
  for (const value of ['', 'invalid', '2026-02-29T10:00', '2026-02-30T10:00', '2026-13-01T10:00',
    '2026-10-20T24:00', '2026-10-20T10:60', '2026-10-20T10:00:60',
    '2026-10-20T10:00Z', '2026-10-20T10:00+08:00', '2026-10-20T10:00:00.1234']) {
    assert.throws(() => manilaWeighingTimeToUtc(value), Error, value);
  }
  assert.throws(() => manilaWeighingInput('invalid'));
});
