import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import express from 'express';
import { maskCompletedDeliveryLocation } from './completed-delivery-mask.js';
import { createScopedListRouter } from './scoped-lists.js';
import { summarizeHeadcounts, summarizeAmounts, validDay } from '../shared/reporting.js';

// Synthetic fixtures only. Coordinates are fictional.
const position = { latitude: 13.9, longitude: 122.3, accuracyMeters: 8, capturedAt: '2026-10-24T01:00:00Z', receivedAt: '2026-10-24T01:00:01Z' };
const pin = { latitude: 13.91, longitude: 122.31, revision: 2 };
const delivery = status => ({
  assigneeUid: 'staff-1', destination: 'Synthetic Market · A · 1', status, assignedBy: 'inspector-1', assignedAt: '2026-10-24T00:00:00Z',
  destinationVerification: { marketName: 'Synthetic Market', verifiedBy: 'inspector-1', verifiedAt: '2026-10-24T00:00:00Z' },
  destinationPin: pin, location: position, ...(status === 'delivered' ? { deliveredAt: '2026-10-24T02:00:00Z' } : {})
});
const invoice = (id, status, extra = {}) => ({ id, vendor_id: 'VEN-A', municipalScopeId: 'scope', date_issued: '2026-10-24', total_amount: 95,
  payment_status: 'Unpaid', createdBy: 'billing-1', delivery: delivery(status), ...extra });
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const between = (from, to) => { const begin = source.indexOf(from); assert.ok(begin >= 0, from); return source.slice(begin, source.indexOf(to, begin)); };
const clone = value => JSON.parse(JSON.stringify(value));

test('mask removes only the driver position of a completed delivery and never mutates the stored record', () => {
  const stored = invoice('I-1', 'delivered'), before = clone(stored);
  const out = maskCompletedDeliveryLocation(stored);
  assert.equal('location' in out.delivery, false);
  assert.deepEqual(out.delivery.destinationPin, pin);
  assert.equal(out.delivery.assignedBy, 'inspector-1');
  assert.equal(out.delivery.destinationVerification.verifiedBy, 'inspector-1');
  assert.equal(out.createdBy, 'billing-1');
  assert.deepEqual(stored, before);
  for (const status of ['assigned', 'in_transit']) {
    const active = invoice('I-2', status);
    assert.equal(maskCompletedDeliveryLocation(active), active);
    assert.deepEqual(active.delivery.location, position);
  }
  const none = { id: 'I-3' };
  assert.equal(maskCompletedDeliveryLocation(none), none);
  assert.equal(maskCompletedDeliveryLocation(null), null);
});

const rows = () => [invoice('I-done', 'delivered'), invoice('I-live', 'in_transit'), { id: 'I-legacy', vendor_id: 'VEN-A', total_amount: 95 }];
const expectMasked = (list, label) => {
  const byId = Object.fromEntries(list.map(row => [row.id, row]));
  assert.equal('location' in byId['I-done'].delivery, false, `${label}: completed location hidden`);
  assert.deepEqual(byId['I-done'].delivery.destinationPin, pin, `${label}: fixed pin retained`);
  assert.equal(byId['I-done'].delivery.assignedBy, 'inspector-1', `${label}: staff attribution retained`);
  assert.equal(byId['I-done'].createdBy, 'billing-1', `${label}: oversight field retained`);
  assert.deepEqual(byId['I-live'].delivery.location, position, `${label}: active delivery unchanged`);
  assert.equal(byId['I-legacy'].delivery, undefined, `${label}: invoice without delivery unchanged`);
};

test('GET /api/invoices masks completed locations', async () => {
  const handlers = {};
  const stored = rows(), before = clone(stored);
  runInNewContext(between("app.get('/api/invoices',", "app.get('/api/invoices/:id'"), {
    app: { get: (path, fn) => { handlers[path] = fn; } }, asyncHandler: fn => fn, maskCompletedDeliveryLocation,
    applyLimit: list => ({ list, error: null }),
    store: { listVendors: async () => [{ id: 'VEN-A', name: 'Vendor A' }], listInvoices: async () => stored }
  });
  let answer; await handlers['/api/invoices']({ query: {} }, { json: body => { answer = body; }, status: () => assert.fail('no error expected') });
  expectMasked(answer, 'list');
  assert.equal(answer.find(row => row.id === 'I-done').vendor_name, 'Vendor A');
  assert.deepEqual(stored, before, 'stored data untouched');
});

test('GET /api/invoices/:id masks a completed location and keeps vendor and municipality', async () => {
  let handler; const stored = { 'I-done': invoice('I-done', 'delivered'), 'I-live': invoice('I-live', 'in_transit') };
  const before = clone(stored);
  runInNewContext(between("app.get('/api/invoices/:id'", '// Due-date policy'), {
    app: { get: (_path, fn) => { handler = fn; } }, asyncHandler: fn => fn, MUNICIPALITY: 'Synthetic', maskCompletedDeliveryLocation,
    store: { getInvoice: async id => stored[id] ?? null, getVendor: async id => ({ id, name: 'Vendor A' }) }
  });
  const read = async id => { let answer, code = 200; await handler({ params: { id } }, { json: body => { answer = body; }, status: c => { code = c; return { json: body => { answer = body; } }; } }); return { answer, code }; };
  const done = (await read('I-done')).answer, live = (await read('I-live')).answer;
  assert.equal('location' in done.delivery, false);
  assert.deepEqual(done.delivery.destinationPin, pin);
  assert.equal(done.delivery.assignedBy, 'inspector-1');
  assert.equal(done.municipality, 'Synthetic'); assert.equal(done.vendor.name, 'Vendor A');
  assert.deepEqual(live.delivery.location, position);
  assert.equal((await read('missing')).code, 404);
  assert.deepEqual(stored, before);
});

const dashboardWith = (production, scopedReads, listInvoices) => runInNewContext(
  between('const buildDashboard =', 'const asyncHandler') + '\nbuildDashboard()', {
    production, scopedReads, MUNICIPALITY: 'Synthetic', summarizeHeadcounts, summarizeAmounts, validDay, maskCompletedDeliveryLocation,
    store: { listVendors: async () => [{ id: 'VEN-A', name: 'Vendor A', status: 'Active' }], listRecords: async () => [], listInvoices, listFees: async () => [] },
    withVendor: () => row => row, manilaDateString: () => '2026-10-24', manilaMonthKey: () => '2026-10', shiftMonthKey: () => '2026-10', monthLabelForKey: () => 'Oct'
  });

test('GET /api/dashboard recent invoices mask completed locations (legacy store path)', async () => {
  const stored = rows(), before = clone(stored);
  const report = await dashboardWith(null, null, async () => stored);
  expectMasked(report.recentInvoices, 'dashboard');
  assert.deepEqual(stored, before);
});

test('GET /api/dashboard recent invoices mask completed locations (scoped production path) and keep the report fields', async () => {
  const base = { summary: { unpaidInvoicesCount: 2 }, recentSlaughterRecords: [], monthlySlaughterVolume: [], municipality: 'Synthetic', recentInvoices: rows() };
  const report = await dashboardWith({ features: {} }, { dashboard: async () => base }, async () => assert.fail('legacy store must not be read'));
  expectMasked(report.recentInvoices, 'scoped dashboard');
  assert.equal(report.summary.unpaidInvoicesCount, 2); assert.equal(report.municipality, 'Synthetic');
});

test('production paged invoice list masks completed locations and still requires the web administrator', async t => {
  const stored = rows().map(row => ({ ...row, municipalScopeId: 'scope' })).sort((a, b) => a.id < b.id ? -1 : 1);
  const app = express();
  app.use((req, _res, next) => { req.webUser = req.headers['x-role'] ? { uid: 'u-1', role: req.headers['x-role'] } : undefined; next(); });
  app.use('/api', createScopedListRouter({ scope: 'scope', cursorSecret: 'synthetic-secret', store: {
    page: async () => stored, get: async () => ({ id: 'VEN-A', name: 'Vendor A' }) } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); t.after(() => new Promise(r => server.close(r)));
  const origin = `http://127.0.0.1:${server.address().port}/api/invoices`;
  const ok = await fetch(origin, { headers: { 'x-role': 'admin' } });
  assert.equal(ok.status, 200); expectMasked((await ok.json()).items, 'paged list');
  for (const role of ['vendor', 'staff', 'inspector']) {
    const denied = await fetch(origin, { headers: { 'x-role': role } });
    assert.equal(denied.status, 403); assert.equal(JSON.stringify(await denied.json()).includes('latitude'), false);
  }
  assert.equal((await fetch(origin)).status, 403);
});
