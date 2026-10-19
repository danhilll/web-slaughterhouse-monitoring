import assert from 'node:assert/strict';
import test from 'node:test';
import { createWebAdminMiddleware, createWriteGuard, parseAdminUids } from './access.js';

function response() {
  return {
    statusCode: 200,
    body: null,
    set() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('multiple configured admin UIDs are parsed without blank entries', () => {
  assert.deepEqual([...parseAdminUids(' first , second, ,first ')], ['first', 'second']);
});

test('anonymous API request is rejected before token verification', async () => {
  const res = response();
  let verified = false;
  const middleware = createWebAdminMiddleware(() => ({ verifyIdToken: async () => { verified = true; } }), new Set(['admin']));
  await middleware({ headers: {} }, res, () => assert.fail('must not continue'));
  assert.equal(res.statusCode, 401);
  assert.equal(verified, false);
});

test('valid vendor token cannot access the web administrator API', async () => {
  const res = response();
  const middleware = createWebAdminMiddleware(() => ({ verifyIdToken: async () => ({ uid: 'vendor', email_verified: true }) }), new Set(['admin']));
  await middleware({ headers: { authorization: 'Bearer token' } }, res, () => assert.fail('must not continue'));
  assert.equal(res.statusCode, 403);
});

test('revoked or invalid token is rejected', async () => {
  const res = response();
  const middleware = createWebAdminMiddleware(() => ({ verifyIdToken: async () => { throw { code: 'auth/id-token-revoked' }; } }), new Set(['admin']));
  await middleware({ headers: { authorization: 'Bearer token' } }, res, () => assert.fail('must not continue'));
  assert.equal(res.statusCode, 401);
});

test('known credential rejections return 401 without SDK details', async () => {
  for (const code of ['auth/argument-error', 'auth/invalid-id-token', 'auth/id-token-expired',
    'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found']) {
    const res = response();
    const middleware = createWebAdminMiddleware(() => ({ verifyIdToken: async (_token, checkRevoked) => {
      assert.equal(checkRevoked, true);
      throw Object.assign(new Error('Private SDK detail'), { code });
    } }), new Set(['admin']));
    await middleware({ headers: { authorization: 'Bearer token' } }, res, () => assert.fail('must not continue'));
    assert.equal(res.statusCode, 401, code);
    assert.deepEqual(res.body, { message: 'Your session is invalid or expired. Please sign in again.' });
  }
});

test('service, permission and unknown verification failures return safe 503 responses', async () => {
  for (const code of ['auth/internal-error', 'auth/insufficient-permission', 'auth/invalid-credential',
    'auth/project-not-found', 'auth/too-many-requests', 'auth/future-error', 'app/network-error', 'ETIMEDOUT', undefined]) {
    const res = response();
    const middleware = createWebAdminMiddleware(() => ({ verifyIdToken: async () => {
      throw Object.assign(new Error('Private SDK detail'), { code, status: 401 });
    } }), new Set(['admin']));
    await middleware({ headers: { authorization: 'Bearer token' } }, res, () => assert.fail('must not continue'));
    assert.equal(res.statusCode, 503, code);
    assert.deepEqual(res.body, { message: 'Authentication is unavailable.' });
  }
});

test('allowlisted admin reaches API with a verified identity', async () => {
  const res = response();
  const req = { headers: { authorization: 'Bearer token' } };
  let nextCalled = false;
  const middleware = createWebAdminMiddleware(() => ({
    verifyIdToken: async (token, checkRevoked) => {
      assert.equal(token, 'token');
      assert.equal(checkRevoked, true);
      return { uid: 'second', email_verified: true, email: 'admin@example.test' };
    }
  }), new Set(['first', 'second']));
  await middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.deepEqual(req.webUser, { uid: 'second', email: 'admin@example.test', role: 'admin' });
});

test('web writes remain paused while reads continue', () => {
  const guard = createWriteGuard(false);
  const read = response();
  let readAllowed = false;
  guard({ method: 'GET' }, read, () => { readAllowed = true; });
  assert.equal(readAllowed, true);

  const write = response();
  guard({ method: 'POST' }, write, () => assert.fail('write must not continue'));
  assert.equal(write.statusCode, 503);
});
