/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { startTrackingPolling, trackingLabel, validateTracking, type Tracking } from './trackingPolling.ts';
const view: Tracking = { invoiceId: 'INV', deliveryStatus: 'in_transit', trackingState: 'recent', location: {
  latitude: 13.9, longitude: 122.2, accuracyMeters: 12, capturedAt: '2026-10-13T01:00:00Z', receivedAt: '2026-10-13T01:00:00Z',
}, serverTime: '2026-10-13T01:00:01Z', updateIntervalSeconds: 10 };
const sleep = (ms = 15) => new Promise(resolve => setTimeout(resolve, ms));
class Visibility extends EventTarget { hidden = false; change(hidden: boolean) { this.hidden = hidden; this.dispatchEvent(new Event('visibilitychange')); } }
test('status distinguishes waiting, stale, completion and connection failure', () => {
  assert.equal(trackingLabel(null, '', null), 'Loading location…');
  assert.equal(trackingLabel({ ...view, location: null }, '', null), 'Waiting for location');
  assert.equal(trackingLabel(view, '', 46), 'Location outdated');
  assert.equal(trackingLabel(view, '', 2), 'Recent location');
  assert.equal(trackingLabel({ ...view, deliveryStatus: 'delivered' }, '', 200), 'Delivery completed');
  assert.equal(trackingLabel(view, 'offline', 2), 'Connection unavailable');
  assert.throws(() => validateTracking({ ...view, invoiceId: 'OTHER' }, 'INV'));
  assert.throws(() => validateTracking({ ...view, location: { ...view.location!, latitude: 91 } }, 'INV'));
});
test('pending requests cannot overlap; cleanup aborts and ignores late responses', async () => {
  const visibility = new Visibility(); let calls = 0, signal: AbortSignal | undefined;
  let finish!: (response: Response) => void; const seen: unknown[] = [];
  const stop = startTrackingPolling({ invoiceId: 'INV', visibility, interval: 5,
    request: s => { calls++; signal = s; return new Promise(resolve => { finish = resolve; }); },
    onData: d => seen.push(d), onError: e => seen.push(e),
  });
  visibility.change(false); visibility.change(false); await sleep(); assert.equal(calls, 1);
  stop(); assert.equal(signal?.aborted, true); finish(Response.json(view)); await sleep();
  visibility.change(false); assert.deepEqual(seen, []); assert.equal(calls, 1);
});
test('hiding aborts, stays idle and resumes exactly once', async () => {
  const visibility = new Visibility(); let calls = 0;
  const stop = startTrackingPolling({ invoiceId: 'INV', visibility, interval: 5,
    request: signal => { calls++; return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))); },
    onData: () => {}, onError: () => assert.fail('hidden cancellation is not an error'),
  });
  visibility.change(true); await sleep(); assert.equal(calls, 1);
  visibility.change(false); await sleep(); assert.equal(calls, 2); stop();
});
for (const status of [401, 403, 404]) test(`access failure ${status} clears old position and stops`, async () => {
  const visibility = new Visibility(); let calls = 0; const seen: unknown[] = []; const errors: string[] = [];
  const stop = startTrackingPolling({ invoiceId: 'INV', visibility, interval: 5,
    request: async () => { calls++; return Response.json({ message: 'Access unavailable' }, { status }); },
    onData: d => seen.push(d), onError: e => errors.push(e),
  });
  await sleep(30); visibility.change(false); await sleep(); stop();
  assert.equal(calls, 1); assert.deepEqual(seen, [null]); assert.deepEqual(errors, ['Access unavailable']);
});
test('temporary errors preserve old fix; recovery and completion stop polling', async () => {
  const visibility = new Visibility(); let calls = 0; const seen: unknown[] = []; const errors: string[] = [];
  const stop = startTrackingPolling({ invoiceId: 'INV', visibility, interval: 5,
    request: async () => { calls++; return calls === 2 ? Response.json({ message: 'Offline' }, { status: 503 }) : Response.json(calls === 1 ? view : { ...view, deliveryStatus: 'delivered' }); },
    onData: d => seen.push(d), onError: e => errors.push(e),
  });
  await sleep(100); stop(); assert.equal(calls, 3); assert.equal(seen.length, 2); assert.ok(!seen.includes(null)); assert.ok(errors.includes('Offline'));
  assert.equal((seen[1] as Tracking).location, null);
});
test('rate limit survives visibility changes without extra requests', async () => {
  const visibility = new Visibility(); let calls = 0;
  const stop = startTrackingPolling({ invoiceId: 'INV', visibility, interval: 5,
    request: async () => { calls++; return Response.json({ message: 'Wait' }, { status: 429, headers: { 'Retry-After': '1' } }); },
    onData: () => assert.fail('no data on rate limit'), onError: () => {},
  });
  await sleep(); visibility.change(true); visibility.change(false); await sleep(40); stop(); assert.equal(calls, 1);
});
test('request timeout aborts then retries without overlapping', async () => {
  const visibility = new Visibility(); let calls = 0, active = 0, max = 0; const errors: string[] = [];
  const stop = startTrackingPolling({ invoiceId: 'INV', visibility, interval: 5, timeout: 10,
    request: signal => { calls++; active++; max = Math.max(max, active); return new Promise((_, reject) => signal.addEventListener('abort', () => { active--; reject(new Error('aborted')); })); },
    onData: () => {}, onError: e => errors.push(e),
  });
  await sleep(100); stop(); assert.ok(calls > 1); assert.equal(max, 1); assert.ok(errors.some(e => e.includes('timed out')));
});
