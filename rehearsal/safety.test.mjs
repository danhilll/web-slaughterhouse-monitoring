import test from 'node:test';
import assert from 'node:assert/strict';
import { assertEmulators, enforceLoopbackOnly, PROJECT_ID } from './safety.mjs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
const safe = { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180' };
test('explicit loopback hosts and exact demo project are required', () => {
  assert.equal(assertEmulators(safe).projectId, PROJECT_ID);
  for (const env of [{}, { ...safe, FIREBASE_AUTH_EMULATOR_HOST: '' }, { ...safe, FIRESTORE_EMULATOR_HOST: '' },
    { ...safe, FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com:443' }, { ...safe, GCLOUD_PROJECT: 'production' },
    { ...safe, GOOGLE_APPLICATION_CREDENTIALS: 'real-key.json' }, { ...safe, FIREBASE_TOKEN: 'real-token' },
    { ...safe, FIRESTORE_EMULATOR_HOST: safe.FIREBASE_AUTH_EMULATOR_HOST }]) {
    assert.throws(() => assertEmulators(env));
  }
});
test('network guard rejects remote requests before opening connections', () => {
  enforceLoopbackOnly();
  assert.throws(() => fetch('http://example.invalid/'));
  assert.throws(() => fetch('https://127.0.0.1/'));
  assert.throws(() => http.get('http://example.invalid/'));
  assert.throws(() => https.get('https://example.invalid/'));
  const socket = new net.Socket();
  assert.throws(() => socket.connect({ host: 'example.invalid', port: 443 }));
  socket.destroy();
});
