import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWebDemo, DEMO_ADMIN_UID } from './web-demo-startup.mjs';

const env = { GCLOUD_PROJECT: 'demo-mobile-rehearsal',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180' };
const email = 'web-admin@rehearsal.example.test';
const existing = () => ({ uid: DEMO_ADMIN_UID, email, disabled: false, emailVerified: true,
  providerData: [{ providerId: 'password', email }], customClaims: { unrelated: 'preserved' } });
function harness(user = existing(), readError) {
  const calls = [];
  const forbidden = name => () => { calls.push(name); throw Error('Unexpected provisioning write: ' + name); };
  const auth = new Proxy({ getUser: async uid => {
    calls.push('getUser'); assert.equal(uid, DEMO_ADMIN_UID);
    if (readError) throw readError;
    return user;
  } }, { get: (target, key) => key in target ? target[key] : forbidden('auth.' + String(key)) });
  const db = new Proxy({}, { get: (_, key) => forbidden('db.' + String(key)) });
  const context = { auth, db, hosts: { projectId: env.GCLOUD_PROJECT,
    auth: { address: env.FIREBASE_AUTH_EMULATOR_HOST }, firestore: { address: env.FIRESTORE_EMULATOR_HOST } } };
  return { calls, context, options: { args: ['--preserve-fixtures'], env, createContext: async () => context } };
}
test('preserve startup reads existing administrator only, without claims or document writes', async () => {
  const user = existing(), before = structuredClone(user), h = harness(user);
  const result = await prepareWebDemo(h.options);
  assert.equal(result.uid, DEMO_ADMIN_UID); assert.equal(result.context, h.context);
  assert.equal(result.carcassWeightEnabled, false);
  assert.deepEqual(h.calls, ['getUser']); assert.deepEqual(user, before);
});
test('preserve startup fails missing/unavailable administrator without provisioning fallback', async () => {
  for (const [code, message] of [['auth/user-not-found', /prerequisite missing/], ['auth/internal-error', /prerequisite unavailable/]]) {
    const h = harness(undefined, { code });
    await assert.rejects(prepareWebDemo(h.options), message); assert.deepEqual(h.calls, ['getUser']);
  }
});
test('preserve startup rejects conflicting identity and sign-in prerequisites without writes', async () => {
  for (const change of [{ uid: 'another-user' }, { email: 'other@rehearsal.example.test' },
    { disabled: true }, { disabled: undefined }, { emailVerified: false }, { providerData: [] },
    { providerData: [{ providerId: 'google.com', email }] },
    { providerData: [{ providerId: 'password', email: 'other@rehearsal.example.test' }] }]) {
    const h = harness({ ...existing(), ...change });
    await assert.rejects(prepareWebDemo(h.options), /prerequisite conflict/);
    assert.deepEqual(h.calls, ['getUser']);
  }
});
test('preserve startup keeps project, credential and loopback/port guards before context creation', async () => {
  for (const change of [{ GCLOUD_PROJECT: 'production' }, { GOOGLE_APPLICATION_CREDENTIALS: 'key.json' },
    { FIREBASE_AUTH_EMULATOR_HOST: 'remote.example:9199' },
    { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8181' }]) {
    let created = false;
    await assert.rejects(prepareWebDemo({ args: ['--preserve-fixtures'], env: { ...env, ...change },
      createContext: async () => { created = true; } }));
    assert.equal(created, false);
  }
  const h = harness(); h.context.hosts.projectId = 'production';
  await assert.rejects(prepareWebDemo(h.options), /documented demo project/);
  assert.deepEqual(h.calls, []);
});
test('default startup still creates the reserved administrator or validates an existing one', async () => {
  for (const alreadyExists of [false, true]) {
    const h = harness(); h.context.auth = {
      createUser: async value => {
        h.calls.push('createUser'); assert.equal(value.uid, DEMO_ADMIN_UID);
        assert.equal(value.email, email); assert.equal(value.emailVerified, true);
        if (alreadyExists) throw { code: 'auth/uid-already-exists' };
      }, getUser: async () => { h.calls.push('getUser'); return existing(); }
    };
    await prepareWebDemo({ ...h.options, args: [] });
    assert.deepEqual(h.calls, alreadyExists ? ['createUser', 'getUser'] : ['createUser']);
  }
});
