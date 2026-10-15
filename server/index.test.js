import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import express from 'express';
import { createOperationsRouter, syntheticOperationsEnabled } from './operations.js';
import { createAnimalRouter } from './animals.js';
import { isValidHeadcount } from './headcounts.js';

test('startup wiring evaluates operations gates against the initialized project at request time', async t => {
  const app = express();
  const env = {
    ANIMAL_WORKFLOW_ENABLED: 'true', ANIMAL_OPERATIONS_ENABLED: 'true',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180'
  };
  const principal = { uid: 'synthetic-admin', role: 'admin', municipalScopeId: 'ph-quezon-calauag', staffPermissions: [] };
  const context = {
    app, express, routerConfig: () => ({}), process: { env }, firestoreDb: null, firebaseAuth: null, WEB_ADMIN_UIDS: new Set(),
    createAnimalStore: () => ({}),
    createOperationsStore: () => ({ schedule: async () => null, list: async () => [] }),
    createAnimalMobileAuth: () => (req, res, next) => { req.animalUser = principal; next(); },
    createWebAdminMiddleware: () => (req, res, next) => { req.webUser = principal; next(); },
    createMobileRouter: () => express.Router(), createMobileFirestoreStore: () => ({}),
    createOperationsRouter, createAnimalRouter, syntheticOperationsEnabled
  };
  // Execute the actual route wiring only: no .env loading, Admin initialization or server startup.
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const begin = source.indexOf('const animalStore =');
  const end = source.indexOf("app.use('/api/accounts'");
  assert.ok(begin >= 0 && end > begin);
  runInNewContext(source.slice(begin, end), context);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const get = async path => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    return { status: response.status, body: await response.json() };
  };
  const check = async enabled => {
    for (const prefix of ['/api/operations', '/api/mobile/operations']) {
      const settings = await get(`${prefix}/settings`);
      assert.equal(settings.status, 200);
      assert.equal(settings.body.enabled, enabled);
      assert.equal((await get(`${prefix}/invoices`)).status, enabled ? 200 : 503);
    }
    assert.equal((await get('/api/mobile/animals/settings')).body.billingAvailable, enabled);
  };
  await check(false);
  context.firestoreDb = { projectId: 'demo-startup-test' };
  await check(true);
  for (const projectId of ['production', 'com-slaughterhouse-app']) {
    context.firestoreDb = { projectId };
    await check(false);
  }
  context.firestoreDb = { projectId: 'demo-startup-test' };
  for (const key of ['ANIMAL_OPERATIONS_ENABLED', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST']) {
    const original = env[key];
    delete env[key];
    await check(false);
    env[key] = original;
  }
  env.FIRESTORE_EMULATOR_HOST = 'remote.example:8180';
  await check(false);
});

function invoiceWriteFixture() {
  const routes = {}, writes = [];
  const current = { id: 'INV-SYNTHETIC', vendor_id: 'VEN-SYNTHETIC', number_of_heads_cow: 0, number_of_heads_pig: 2 };
  const context = {
    app: { post: (path, fn) => { routes.post = fn; }, patch: (path, fn) => { routes.patch = fn; } },
    asyncHandler: fn => fn, isValidHeadcount,
    isValidDate: value => value === '2026-10-15', PAYMENT_STATUSES: ['Paid', 'Unpaid', 'Overdue'],
    newId: prefix => `${prefix}-SYNTHETIC`,
    getFeeAmounts: async () => ({ corral: 15, delivery: 25, antiMortem: 10, facility: 45 }),
    store: {
      getVendor: async () => ({ id: 'VEN-SYNTHETIC' }),
      getInvoice: async () => structuredClone(current),
      saveInvoice: async row => writes.push(structuredClone(row)),
      saveNotification: async () => {}, listVendors: async () => [],
      updateInvoice: async (_id, patch) => { writes.push(structuredClone(patch)); return { ...current, ...patch }; }
    }
  };
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  for (const [start, end] of [
    ['const computeFeeBreakdown =', 'const withVendor ='],
    ["app.post('/api/invoices'", "app.get('/api/notifications'"],
    ["app.patch('/api/invoices/:id'", "app.delete('/api/invoices/:id'"]
  ]) {
    const begin = source.indexOf(start), finish = source.indexOf(end, begin);
    assert.ok(begin >= 0 && finish > begin);
    // Actual handlers only: no server startup, .env, Firebase, or changes to live gates.
    runInNewContext(source.slice(begin, finish), context);
  }
  return { writes, current, async call(method, counts) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await routes[method]({ params: { id: current.id }, body: { vendor_id: current.vendor_id, date_issued: '2026-10-15', ...counts } }, res);
    return res;
  } };
}

test('invoice create and edit accept maximum Int headcounts without changing fee calculations', async () => {
  for (const method of ['post', 'patch']) {
    for (const field of ['number_of_heads_cow', 'number_of_heads_pig']) {
      const f = invoiceWriteFixture();
      const counts = { number_of_heads_cow: 0, number_of_heads_pig: 0, [field]: 2147483647 };
      const result = await f.call(method, counts);
      assert.equal(result.statusCode, method === 'post' ? 201 : 200);
      assert.equal(f.writes.length, 1);
      assert.equal(f.writes[0][field], 2147483647);
      assert.equal(f.writes[0].total_amount, 2147483647 * 95);
    }
  }
});

test('invoice create and edit reject oversized, negative and fractional counts before writing', async () => {
  for (const method of ['post', 'patch']) {
    for (const field of ['number_of_heads_cow', 'number_of_heads_pig']) {
      for (const count of [2147483648, -1, 0.5]) {
        const f = invoiceWriteFixture();
        const before = structuredClone(f.current);
        assert.equal((await f.call(method, { [field]: count })).statusCode, 400);
        assert.equal(f.writes.length, 0);
        assert.deepEqual(f.current, before);
      }
    }
  }
});
