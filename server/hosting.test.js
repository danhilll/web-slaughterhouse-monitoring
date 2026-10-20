import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerReadiness, registerWebAssets } from './hosting.js';
import { createWebAdminMiddleware } from './access.js';

async function fixture(t, enabled = true) {
  const directory = await mkdtemp(join(tmpdir(), 'municipal-hosting-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'assets'));
  await writeFile(join(directory, 'index.html'), '<html><body>Login shell</body></html>');
  await writeFile(join(directory, 'assets', 'app-test.js'), 'console.log("test asset")');
  await writeFile(join(directory, 'assets', 'maplibre-gl-worker-fixture.js'), 'self.onmessage = () => {};');
  await writeFile(join(directory, '.env'), 'private test value');
  const app = express(); let ready = false;
  registerReadiness(app, () => ready);
  app.use('/api', createWebAdminMiddleware(() => ({ verifyIdToken: async token => ({ uid: token, email_verified: true }) }), new Set(['admin'])));
  app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found.' }));
  registerWebAssets(app, { enabled, directory });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { setReady: value => { ready = value; }, get: (path, token, accept = 'text/html') => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    headers: { Accept: accept, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  }) };
}
test('provider health exposes only initialized status, without authentication', async t => {
  const f = await fixture(t); let r = await f.get('/healthz');
  assert.equal(r.status, 503); assert.deepEqual(await r.json(), { ok: false });
  f.setReady(true); r = await f.get('/healthz'); assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true }); assert.equal(r.headers.get('cache-control'), 'no-store');
});
test('static hosting serves login and SPA deep links, with cacheable assets', async t => {
  const f = await fixture(t);
  for (const path of ['/', '/operations', '/users']) {
    const r = await f.get(path); assert.equal(r.status, 200); assert.match(await r.text(), /Login shell/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
  }
  const r = await f.get('/assets/app-test.js'); assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /immutable/);
});
test('static fallback cannot bypass API authentication or convert API failures into HTML', async t => {
  const f = await fixture(t);
  for (const [token, status] of [[undefined, 401], ['vendor', 403], ['admin', 404]]) {
    const r = await f.get('/api/unknown', token); assert.equal(r.status, status);
    assert.match(r.headers.get('content-type'), /application\/json/); assert.ok((await r.json()).message);
  }
});
test('missing assets and dotfiles do not fall through to the login shell', async t => {
  const f = await fixture(t);
  for (const path of ['/assets/missing', '/missing.js', '/.env', '/anything/.hidden']) {
    const r = await f.get(path); assert.equal(r.status, 404); assert.doesNotMatch(await r.text(), /Login shell|private test value/);
  }
  const r = await f.get('/users', undefined, 'application/json'); assert.equal(r.status, 404);
});
test('web asset hosting stays opt-in and rejects a missing build when enabled', async t => {
  const f = await fixture(t, false); assert.equal((await f.get('/operations')).status, 404);
  assert.throws(() => registerWebAssets(express(), { enabled: true, directory: join(tmpdir(), 'absent-build-for-municipal-test') }), /built dist/);
});

test('bundled MapLibre worker receives its own network and script CSP without weakening app policy', async t => {
 const f=await fixture(t);
 const worker=await f.get('/assets/maplibre-gl-worker-fixture.js');
 assert.equal(worker.status,200);
 const policy=worker.headers.get('content-security-policy');
 assert.match(policy,/default-src 'none'/);assert.match(policy,/script-src 'self'/);
 assert.match(policy,/connect-src https:\/\/tile.openstreetmap.org;/);
 assert.doesNotMatch(policy,/unsafe-eval|unpkg|carto|connect-src 'self'/);
 assert.equal(worker.headers.get('referrer-policy'),'origin');
 assert.equal((await f.get('/assets/app-test.js')).headers.get('content-security-policy'),null);
});
