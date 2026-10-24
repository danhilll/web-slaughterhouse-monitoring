import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createMobileRouter, createMobileFirestoreStore } from './mobile.js';
import { createWebAdminMiddleware, createWriteGuard } from './access.js';

const vendor = (id, scope = 'SCOPE-A') => ({ id, name: `Synthetic ${id}`, address: 'Synthetic address',
  contact_number: '000', email: `${id}@example.test`, animal_type: 'Pig', created_at: '2026-10-01',
  status: 'Active', municipalScopeId: scope });
const invoice = (id, business = 'VEN-A', scope = 'SCOPE-A', status = 'Unpaid') => ({ id,
  vendor_id: business, municipalScopeId: scope, slaughter_record_id: null, date_issued: '2026-10-01',
  due_date: '2026-10-15', number_of_heads_cow: 0, number_of_heads_pig: 2, corral_fee: 15,
  delivery_fee: 25, anti_mortem_fee: 10, facility_fee: 45, total_amount: 95,
  payment_status: status, notes: 'Synthetic only', internal_secret: 'must not be exposed' });

async function fixture(t, change = () => {}, production = null) {
  const state = {
    tokens: { alice: { uid: 'UID-A', municipalRole: 'vendor', municipalScopeId: 'SCOPE-A' },
      bob: { uid: 'UID-B', municipalRole: 'vendor', municipalScopeId: 'SCOPE-A' },
      carol: { uid: 'UID-C', municipalRole: 'vendor', municipalScopeId: 'SCOPE-C' },
      staff: { uid: 'UID-S', municipalRole: 'staff', municipalScopeId: 'SCOPE-A' },
      inspector: { uid: 'UID-I', municipalRole: 'inspector', municipalScopeId: 'SCOPE-A' },
      admin: { uid: 'UID-ADMIN' } },
    memberships: { 'UID-A': { role: 'vendor', status: 'active', municipalScopeId: 'SCOPE-A', vendorBusinessId: 'VEN-A' },
      'UID-B': { role: 'vendor', status: 'active', municipalScopeId: 'SCOPE-A', vendorBusinessId: 'VEN-B' },
      'UID-C': { role: 'vendor', status: 'active', municipalScopeId: 'SCOPE-C', vendorBusinessId: 'VEN-C' },
      'UID-S': { role: 'staff', status: 'active', municipalScopeId: 'SCOPE-A' },
      'UID-I': { role: 'inspector', status: 'active', municipalScopeId: 'SCOPE-A' } },
    vendors: { 'VEN-A': vendor('VEN-A'), 'VEN-B': vendor('VEN-B'), 'VEN-C': vendor('VEN-C', 'SCOPE-C') },
    invoices: [invoice('INV-1'), invoice('INV-2', 'VEN-A', 'SCOPE-A', 'Paid'),
      invoice('INV-3', 'VEN-A', 'SCOPE-A', 'Overdue'), invoice('INV-4', 'VEN-B'),
      invoice('INV-5', 'VEN-A', 'SCOPE-C'), invoice('INV-6', 'VEN-C', 'SCOPE-C'),
      invoice('INV-7', 'VEN-A', undefined)],
    reads: [], now: 1000, writes: 0
  };
  for (const token of Object.values(state.tokens)) token.email_verified = true;
  // Unscoped fixture must remain invisible even when its vendor reference matches.
  delete state.invoices.at(-1).municipalScopeId;
  change(state);
  const auth = { verifyIdToken: async (token, revoked) => {
    assert.equal(revoked, true);
    if (state.verificationFailure) throw state.verificationFailure;
    if (['disabled', 'revoked', 'expired', 'wrong-project'].includes(token)) {
      throw { code: token === 'disabled' ? 'auth/user-disabled' : 'auth/id-token-revoked' };
    }
    if (!state.tokens[token]) throw { code: 'auth/invalid-id-token' };
    return state.tokens[token];
  } };
  const store = {
    getMembership: async (uid) => state.memberships[uid],
    getVendor: async (id) => state.vendors[id],
    listInvoices: async (query) => {
      state.reads.push(query);
      return state.invoices.filter((row) => row.vendor_id === query.vendorBusinessId &&
        row.municipalScopeId === query.municipalScopeId && (!query.after || row.id > query.after))
        .sort((a, b) => a.id.localeCompare(b.id)).slice(0, query.limit);
    }
  };
  const app = express();
  app.use('/api/mobile', createMobileRouter({ production, getAuth: () => auth, store,
    cursorSecret: Buffer.alloc(32, 1), now: () => state.now }));
  app.use('/api', createWebAdminMiddleware(() => auth, new Set(['UID-ADMIN'])));
  app.use('/api', createWriteGuard(false));
  app.get('/api/session', (req, res) => res.json(req.webUser));
  app.post('/api/invoices', (req, res) => { state.writes++; res.json({}); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { state, store, async request(path, token = 'alice', method = 'GET') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const body = await response.json();
    return { status: response.status, body, cache: response.headers.get('cache-control') };
  } };
}

test('mobile credential rejection stays 401; backend and unknown verifier failures are safe 503', async t => {
  const { state, request } = await fixture(t);
  for (const code of ['auth/argument-error', 'auth/invalid-id-token', 'auth/id-token-expired',
    'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found',
    'auth/internal-error', 'auth/insufficient-permission', 'auth/invalid-credential',
    'auth/future-error', 'ETIMEDOUT', undefined]) {
    state.verificationFailure = Object.assign(new Error('Private SDK detail'), { code });
    const rejected = ['auth/argument-error', 'auth/invalid-id-token', 'auth/id-token-expired',
      'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found'].includes(code);
    for (const path of ['/api/mobile/me', '/api/mobile/invoices']) {
      const result = await request(path);
      assert.equal(result.status, rejected ? 401 : 503, code);
      assert.equal(result.cache, 'no-store');
      assert.deepEqual(result.body, rejected
        ? { code: 'invalid_session', message: 'Your session is invalid or expired.' }
        : { code: 'unavailable', message: 'Mobile access is unavailable.' });
    }
  }
  state.verificationFailure = null;
  assert.equal((await request('/api/mobile/me')).status, 200);
  assert.equal(state.writes, 0);
});

test('real HTTP handlers expose own canonical profile and bounded scoped invoice pages', async (t) => {
  const { request, state } = await fixture(t);
  const me = await request('/api/mobile/me');
  assert.equal(me.status, 200); assert.equal(me.cache, 'no-store');
  assert.equal(me.body.uid, 'UID-A'); assert.equal(me.body.vendor.id, 'VEN-A');
  assert.equal(me.body.vendorBusinessId, 'VEN-A'); assert.equal(me.body.capabilities.mutations, false);
  const first = await request('/api/mobile/invoices?limit=2');
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.items.map((row) => row.id), ['INV-1', 'INV-2']);
  assert.deepEqual(first.body.items.map((row) => row.payment_status), ['Unpaid', 'Paid']);
  assert.equal(first.body.items[0].vendor_id, 'VEN-A');
  assert.equal(first.body.items[0].total_amount, 95);
  assert.equal(first.body.items[0].internal_secret, undefined);
  const second = await request(`/api/mobile/invoices?limit=2&cursor=${first.body.nextCursor}`);
  assert.deepEqual(second.body.items.map((row) => row.id), ['INV-3']);
  assert.equal(second.body.items[0].payment_status, 'Overdue'); assert.equal(second.body.nextCursor, null);
  assert.equal(state.reads[0].limit, 3); assert.equal(state.reads[1].after, 'INV-2');
  assert.equal((await request('/api/mobile/invoices', 'bob')).body.items[0].id, 'INV-4');
  assert.equal((await request('/api/mobile/invoices', 'carol')).body.items[0].id, 'INV-6');
});

test('forged selectors, other-user/scope cursors, tampered and expired cursors fail', async (t) => {
  const { request, state } = await fixture(t);
  const cursor = (await request('/api/mobile/invoices?limit=1')).body.nextCursor;
  for (const token of ['bob', 'carol']) assert.equal((await request(`/api/mobile/invoices?cursor=${cursor}`, token)).status, 400);
  assert.equal((await request(`/api/mobile/invoices?cursor=${cursor}x`)).status, 400);
  for (const query of ['vendor_id=VEN-B', 'municipalScopeId=SCOPE-C', 'limit=0', 'limit=51', 'limit=1.5', 'limit=1&limit=2']) {
    assert.equal((await request(`/api/mobile/invoices?${query}`)).status, 400);
  }
  assert.equal((await request('/api/mobile/me?uid=UID-B')).status, 400);
  state.now += 3600001;
  assert.equal((await request(`/api/mobile/invoices?cursor=${cursor}`)).status, 400);
});

for (const [name, change] of [
  ['missing membership', (s) => delete s.memberships['UID-A']],
  ['inactive membership', (s) => s.memberships['UID-A'].status = 'inactive'],
  ['wrong role claim', (s) => s.tokens.alice.municipalRole = 'staff'],
  ['wrong scope claim', (s) => s.tokens.alice.municipalScopeId = 'SCOPE-C'],
  ['missing claim', (s) => delete s.tokens.alice.municipalScopeId],
  ['invalid role', (s) => s.memberships['UID-A'].role = 'admin'],
  ['missing vendor', (s) => delete s.vendors['VEN-A']],
  ['inactive vendor', (s) => s.vendors['VEN-A'].status = 'Inactive'],
  ['wrong vendor scope', (s) => s.vendors['VEN-A'].municipalScopeId = 'SCOPE-C'],
  ['conflicting vendor ID', (s) => s.vendors['VEN-A'].id = 'VEN-B'],
  ['blank vendor reference', (s) => s.memberships['UID-A'].vendorBusinessId = ' '],
  ['malformed scope', (s) => s.memberships['UID-A'].municipalScopeId = []]
]) test(`${name} fails closed in both mobile handlers`, async (t) => {
  const { request, state } = await fixture(t, change);
  assert.equal((await request('/api/mobile/me')).status, 403);
  assert.equal((await request('/api/mobile/invoices')).status, 403);
  assert.equal(state.reads.length, 0);
});

test('anonymous, invalid, disabled, revoked, expired and wrong-project users fail', async (t) => {
  const { request } = await fixture(t);
  for (const token of [null, 'invalid', 'disabled', 'revoked', 'expired', 'wrong-project']) {
    assert.equal((await request('/api/mobile/me', token)).status, 401);
    assert.equal((await request('/api/mobile/invoices', token)).status, 401);
  }
});

test('membership changes take effect on next request; empty success differs from failure', async (t) => {
  const { request, state } = await fixture(t);
  state.invoices = [];
  assert.deepEqual((await request('/api/mobile/invoices')).body, { items: [], nextCursor: null });
  state.memberships['UID-A'].status = 'inactive';
  assert.equal((await request('/api/mobile/invoices')).status, 403);
});

test('staff/inspector business access and all mobile mutations are unavailable; admin guard preserved', async (t) => {
  const { request, state } = await fixture(t);
  for (const token of ['staff', 'inspector']) {
    assert.equal((await request('/api/mobile/me', token)).body.capabilities.invoices, false);
    assert.equal((await request('/api/mobile/invoices', token)).status, 403);
    assert.equal((await request('/api/mobile/vendors', token)).status, 404);
  }
  assert.equal((await request('/api/session')).status, 403);
  assert.equal((await request('/api/session', 'admin')).body.role, 'admin');
  assert.equal((await request('/api/mobile/me', 'admin')).status, 403);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const path of ['/api/mobile/me', '/api/mobile/invoices', '/api/mobile/mobile_memberships/UID-A']) {
      assert.equal((await request(path, 'alice', method)).status, 405);
    }
  }
  assert.equal((await request('/api/invoices', 'admin', 'POST')).status, 503);
  assert.equal(state.writes, 0);
});

test('untrusted store results and malformed canonical fields are never returned', async (t) => {
  const { request, store } = await fixture(t);
  for (const row of [invoice('INV-X', 'VEN-B'), invoice('INV-X', 'VEN-A', 'SCOPE-C'),
    { ...invoice('INV-X'), payment_status: 'Pending' }, { ...invoice('INV-X'), total_amount: '95' },
    { ...invoice('INV-X'), due_date: '2026-02-30' }]) {
    store.listInvoices = async () => [row];
    assert.equal((await request('/api/mobile/invoices')).status, 503);
  }
});

test('mobile invoice headcounts accept Android Int bounds and reject incompatible records unchanged', async t => {
  const { request, state } = await fixture(t);
  for (const field of ['number_of_heads_cow', 'number_of_heads_pig']) {
    for (const count of [0, 2147483647, 2147483648, -1, 0.5]) {
      state.invoices = [{ ...invoice('INV-BOUNDARY'), [field]: count }];
      const before = structuredClone(state.invoices);
      const result = await request('/api/mobile/invoices');
      assert.equal(result.status, count === 0 || count === 2147483647 ? 200 : 503);
      if (result.status === 200) assert.equal(result.body.items[0][field], count);
      else assert.equal(result.body.code, 'unavailable');
      assert.deepEqual(state.invoices, before);
    }
  }
});

test('Firestore adapter issues a bounded scope/business query with document-ID cursor', async () => {
  const calls = [];
  const query = {
    where(...args) { calls.push(['where', ...args]); return this; },
    orderBy(field) { calls.push(['orderBy', field]); return this; },
    startAfter(id) { calls.push(['startAfter', id]); return this; },
    limit(limit) { calls.push(['limit', limit]); return this; },
    async get() { return { docs: [{ id: 'INV-2', data: () => invoice('INV-2') }] }; }
  };
  const db = { collection(name) { calls.push(['collection', name]); return query; } };
  const store = createMobileFirestoreStore(() => db);
  await store.listInvoices({ municipalScopeId: 'SCOPE-A', vendorBusinessId: 'VEN-A', after: 'INV-1', limit: 21 });
  assert.deepEqual(calls.slice(0, 3), [['collection', 'invoices'], ['where', 'municipalScopeId', '==', 'SCOPE-A'],
    ['where', 'vendor_id', '==', 'VEN-A']]);
  assert.deepEqual(calls.slice(-2), [['startAfter', 'INV-1'], ['limit', 21]]);
});

test('production mobile reads reject otherwise valid membership in a different municipality',async t=>{
  const {request}=await fixture(t,()=>{},{municipalScopeId:'SCOPE-A'});
  assert.equal((await request('/api/mobile/me','alice')).status,200);
  assert.equal((await request('/api/mobile/me','carol')).status,403);
});


test('verified email never substitutes for active approved membership or matching role/scope', async t => {
  for (const change of [
    s => s.memberships['UID-A'].status = 'pending',
    s => s.memberships['UID-A'].status = 'inactive',
    s => delete s.memberships['UID-A'],
    s => s.tokens.alice.municipalRole = 'staff',
    s => s.tokens.alice.municipalScopeId = 'OTHER',
    s => s.vendors['VEN-A'].status = 'Inactive'
  ]) {
    const { request } = await fixture(t, change);
    assert.equal((await request('/api/mobile/me')).status, 403);
  }
});

test('vendor invoices carry the allow-listed weight basis recorded at issue; malformed snapshots are omitted', async t => {
  const calculated = { method: 'calculated_80_percent', liveWeightGrams: 100000, factor: 0.8, carcassWeightGrams: 80000, rule: 'live_x_0.8', rounding: 'nearest_gram', animalRevision: 2, internal: 'x' };
  const measured = { method: 'measured', liveWeightGrams: 100000, carcassWeightGrams: 79500, weighedAt: '2026-10-01T01:00:00.000Z', measurementRevision: 1, animalRevision: 3 };
  const { request } = await fixture(t, state => {
    Object.assign(state.invoices[0], { carcassBasis: calculated, animalRevision: 2 });
    Object.assign(state.invoices[1], { carcassBasis: measured, animalRevision: 3 });
    Object.assign(state.invoices[2], { carcassBasis: { ...calculated, factor: 0.9 }, animalRevision: 2 });
  });
  const rows = [...(await request('/api/mobile/invoices?limit=2')).body.items];
  const { body } = await request('/api/mobile/invoices?limit=2');
  rows.push(...(await request(`/api/mobile/invoices?limit=2&cursor=${body.nextCursor}`)).body.items);
  const { internal, ...publicCalculated } = calculated;
  assert.deepEqual(rows[0].carcassBasis, publicCalculated); assert.equal(rows[0].animalRevision, 2);
  assert.deepEqual(rows[1].carcassBasis, measured); assert.equal(rows[1].animalRevision, 3);
  assert.equal(rows[2].carcassBasis, undefined); assert.equal(rows[2].animalRevision, undefined);
});

test('a weight basis whose revision disagrees with the invoice is omitted', async t => {
  const { request } = await fixture(t, state => {
    Object.assign(state.invoices[0], { carcassBasis: { method: 'calculated_80_percent', liveWeightGrams: 100000, factor: 0.8, carcassWeightGrams: 80000, animalRevision: 2 }, animalRevision: 5 });
  });
  const row = (await request('/api/mobile/invoices?limit=2')).body.items[0];
  assert.equal(row.carcassBasis, undefined); assert.equal(row.animalRevision, undefined);
});

test('weight basis produced by the real invoice policy passes through the vendor view unchanged', async t => {
  const { carcassBasis } = await import('./owner-workflow-policy.js');
  const { estimateCarcassWeight } = await import('../shared/carcassEstimate.js');
  const base = { revision: 2, species: 'Pig', weightGrams: 100000, inspection: { status: 'approved', revision: 2 } };
  const calculated = carcassBasis({ ...base, carcassEstimate: estimateCarcassWeight(100000, 2) });
  const measured = carcassBasis({ ...base, carcassWeight: { weightGrams: 79500, animalRevision: 2, revision: 1, weighedAt: '2026-10-01T01:00:00.000Z', recordedAt: '2026-10-01T01:05:00.000Z', recordedBy: 'SYNTHETIC-INVENTORY' } });
  assert.equal(calculated.method, 'calculated_80_percent'); assert.equal(measured.method, 'measured');
  const { request } = await fixture(t, state => {
    Object.assign(state.invoices[0], { carcassBasis: calculated, animalRevision: 2 });
    Object.assign(state.invoices[1], { carcassBasis: measured, animalRevision: 2 });
  });
  const rows = (await request('/api/mobile/invoices?limit=2')).body.items;
  assert.deepEqual(rows[0].carcassBasis, calculated); assert.deepEqual(rows[1].carcassBasis, measured);
});
