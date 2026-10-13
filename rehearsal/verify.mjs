import assert from 'node:assert/strict';
import { startRehearsal } from './server.mjs';
import { USERS, signIn } from './fixtures.mjs';

const runtime = await startRehearsal({ port: 0 });
let checks = 0;
const pass = (label) => { checks++; console.log(`PASS ${label}`); };
const request = async (path, token, method = 'GET') => {
  const response = await fetch(runtime.origin + path, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: response.status, body: await response.json() };
};
try {
  const tokens = new Map();
  for (const user of USERS) tokens.set(user.uid, await signIn(user.email));
  const alice = tokens.get('REHEARSAL-ALICE');
  const me = await request('/api/mobile/me', alice);
  assert.equal(me.status, 200); assert.equal(me.body.vendorBusinessId, 'VEN-A'); pass('emulator-issued vendor token and canonical profile');
  const page = await request('/api/mobile/invoices?limit=20', alice);
  assert.equal(page.status, 200); assert.equal(page.body.items.length, 20); assert.ok(page.body.nextCursor);
  assert.ok(page.body.items.every((row) => row.vendor_id === 'VEN-A' && row.municipalScopeId === 'SCOPE-A'));
  const next = await request(`/api/mobile/invoices?cursor=${page.body.nextCursor}`, alice);
  assert.equal(next.status, 200); assert.equal(next.body.items.length, 3); assert.equal(next.body.nextCursor, null);
  assert.equal(new Set([...page.body.items, ...next.body.items].map((row) => row.id)).size, 23);
  pass('real Firestore query, 20+3 pagination and unscoped/cross-scope exclusion');
  for (const [uid, vendor, scope] of [['REHEARSAL-BOB', 'VEN-B', 'SCOPE-A'], ['REHEARSAL-CAROL', 'VEN-C', 'SCOPE-C']]) {
    const result = await request('/api/mobile/invoices', tokens.get(uid));
    assert.equal(result.status, 200); assert.equal(result.body.items.length, 1);
    assert.ok(result.body.items.every((row) => row.vendor_id === vendor && row.municipalScopeId === scope));
    assert.equal((await request(`/api/mobile/invoices?cursor=${page.body.nextCursor}`, tokens.get(uid))).status, 400);
  }
  for (const selector of ['vendor_id=VEN-B', 'municipalScopeId=SCOPE-C']) assert.equal((await request(`/api/mobile/invoices?${selector}`, alice)).status, 400);
  pass('cross-vendor/scope cursor and selector denial');
  for (const uid of ['REHEARSAL-MISSING', 'REHEARSAL-INACTIVE', 'REHEARSAL-MISMATCH']) {
    for (const path of ['/api/mobile/me', '/api/mobile/invoices']) assert.equal((await request(path, tokens.get(uid))).status, 403);
    pass(uid.toLowerCase());
  }
  for (const claims of [{ municipalRole: 'staff', municipalScopeId: 'SCOPE-A' }, { municipalScopeId: 'SCOPE-A' }]) {
    await runtime.auth.setCustomUserClaims('REHEARSAL-ALICE', claims);
    const mismatched = await signIn('alice@rehearsal.example.test');
    for (const path of ['/api/mobile/me', '/api/mobile/invoices']) assert.equal((await request(path, mismatched)).status, 403);
  }
  await runtime.auth.setCustomUserClaims('REHEARSAL-ALICE', { municipalRole: 'vendor', municipalScopeId: 'SCOPE-A' });
  pass('real wrong-role and missing-role claims fail closed');
  await runtime.auth.updateUser('REHEARSAL-DISABLED', { disabled: true });
  for (const path of ['/api/mobile/me', '/api/mobile/invoices']) assert.equal((await request(path, tokens.get('REHEARSAL-DISABLED'))).status, 401);
  pass('disabled user rejected with previously issued real emulator token');
  for (const uid of ['REHEARSAL-STAFF', 'REHEARSAL-INSPECTOR']) assert.equal((await request('/api/mobile/invoices', tokens.get(uid))).status, 403);
  pass('staff/inspector business access remains closed');
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const path of ['/api/mobile/me', '/api/mobile/invoices', '/api/mobile/mobile_memberships/REHEARSAL-ALICE']) {
      assert.equal((await request(path, alice, method)).status, 405);
    }
  }
  assert.equal((await runtime.db.doc('mobile_memberships/REHEARSAL-ALICE').get()).data().role, 'vendor');
  assert.equal((await runtime.db.doc('invoices/INV-VEN-A-001').get()).data().payment_status, 'Unpaid');
  pass('all mobile mutation methods denied and emulator records unchanged');
  const empty = await request('/api/mobile/invoices', tokens.get('REHEARSAL-EMPTY'));
  assert.equal(empty.status, 200); assert.deepEqual(empty.body, { items: [], nextCursor: null }); pass('honest empty invoice success');
  await request('/rehearsal/schema-error/true', null, 'POST');
  assert.equal((await request('/api/mobile/invoices', alice)).status, 503);
  await request('/rehearsal/schema-error/false', null, 'POST');
  assert.equal((await request('/api/mobile/invoices', alice)).status, 200); pass('real malformed-record error and recovery');
  await runtime.db.doc('mobile_memberships/REHEARSAL-ALICE').update({ status: 'inactive' });
  assert.equal((await request('/api/mobile/me', alice)).status, 403);
  await runtime.db.doc('mobile_memberships/REHEARSAL-ALICE').update({ status: 'active' }); pass('membership changes apply without token replacement');
  const denial = await fetch(`http://${runtime.hosts.firestore.address}/v1/projects/${runtime.hosts.projectId}/databases/(default)/documents/invoices/INV-VEN-A-001`,
    { method: 'PATCH', headers: { Authorization: `Bearer ${alice}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { payment_status: { stringValue: 'Paid' } } }) });
  assert.equal(denial.status, 403); pass('direct Firebase client mutation denied by emulator rules');
  await runtime.auth.updateUser('REHEARSAL-DISABLED', { disabled: false });
  console.log(`REHEARSAL PASSED: ${checks} checks using actual local Auth/Firestore and mobile router`);
} finally {
  await new Promise((resolve) => runtime.server.close(resolve));
  await runtime.db.terminate();
}
