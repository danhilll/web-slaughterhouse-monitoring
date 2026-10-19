import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createWebAdminMiddleware } from './access.js';
import { createAnimalMobileAuth } from './animals.js';
import { createMobileRouter } from './mobile.js';

const denial = { code: 'EMAIL_VERIFICATION_REQUIRED', message: 'Verify your email address before accessing this service.' };
test('all protected web/mobile/animal/operations boundaries reject missing or non-boolean verification before data access', async t => {
  let claim, reads = 0, reached = 0, revoked = false;
  const auth = { verifyIdToken: async (uid, checkRevoked) => {
    assert.equal(checkRevoked, true);
    if (revoked) throw { code: 'auth/id-token-revoked' };
    return { uid, email_verified: claim, municipalRole: 'inspector', municipalScopeId: 'SCOPE' };
  } };
  const store = { membership: async () => { reads++; return { role: 'inspector', status: 'active', municipalScopeId: 'SCOPE' }; },
    getMembership: async () => { reads++; return { role: 'inspector', status: 'active', municipalScopeId: 'SCOPE' }; } };
  const app = express();
  for (const path of ['/api/mobile/animals', '/api/mobile/operations']) {
    app.use(path, createAnimalMobileAuth(() => auth, store), (req, res) => { reached++; res.json({}); });
  }
  app.use('/api/mobile', createMobileRouter({ getAuth: () => auth, store }));
  app.use('/api', createWebAdminMiddleware(() => auth, new Set(['ADMIN'])), (req, res) => { reached++; res.json({}); });
  const server = app.listen(0, '127.0.0.1'); await new Promise(done => server.once('listening', done));
  t.after(() => new Promise(done => server.close(done)));
  const call = (path, uid, method = 'GET') => fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { Authorization: `Bearer ${uid}` } });
  for (claim of [undefined, false, 'true', 1, null]) for (const uid of ['ADMIN', 'vendor', 'inventory', 'billing', 'delivery', 'inspector']) {
    for (const [path, method] of [['/api/session','GET'], ['/api/accounts','POST'], ['/api/mobile/me','GET'], ['/api/mobile/invoices','GET'], ['/api/mobile/animals','GET'], ['/api/mobile/animals','POST'], ['/api/mobile/operations/settings','GET'], ['/api/mobile/operations/invoices/test/payment','POST']]) {
      const res = await call(path, uid, method);
      assert.equal(res.status, 403, `${uid} ${path}`); assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await res.json(), denial);
    }
  }
  assert.equal(reads, 0); assert.equal(reached, 0);
  claim = true;
  assert.equal((await call('/api/session', 'ADMIN')).status, 200);
  assert.equal((await call('/api/session', 'inspector')).status, 403); // Email is not an administrator grant.
  assert.equal((await call('/api/mobile/me', 'inspector')).status, 200);
  revoked = true;
  for (const path of ['/api/session', '/api/mobile/me', '/api/mobile/animals', '/api/mobile/operations/settings']) assert.equal((await call(path, 'ADMIN')).status, 401);
});
