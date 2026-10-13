import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import express from 'express';
import { createOperationsRouter, syntheticOperationsEnabled } from './operations.js';
import { createAnimalRouter } from './animals.js';

test('startup wiring evaluates operations gates against the initialized project at request time', async t => {
  const app = express();
  const env = {
    ANIMAL_WORKFLOW_ENABLED: 'true', ANIMAL_OPERATIONS_ENABLED: 'true',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180'
  };
  const principal = { uid: 'synthetic-admin', role: 'admin', municipalScopeId: 'ph-quezon-calauag', staffPermissions: [] };
  const context = {
    app, express, process: { env }, firestoreDb: null, firebaseAuth: null, WEB_ADMIN_UIDS: new Set(),
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
