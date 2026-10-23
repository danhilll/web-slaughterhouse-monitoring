import test from 'node:test';
import assert from 'node:assert/strict';
import {manilaTime} from './displayTime.ts';
test('instants read as Manila local time; unreadable values stay unchanged', () => {
  assert.equal(manilaTime('2026-10-23T17:27:57.210Z'), '2026-10-24 01:27 (Manila)');
  assert.equal(manilaTime('2026-10-24T00:00:00+08:00'), '2026-10-24 00:00 (Manila)');
  assert.equal(manilaTime('2026-10-24'), '2026-10-24');
  assert.equal(manilaTime(undefined), 'time not returned');
});
