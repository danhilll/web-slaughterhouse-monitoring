import { PROJECT_ID, assertEmulators } from './safety.mjs';

export const PASSWORD = 'Synthetic-only-42!';
export const USERS = [
  { uid: 'REHEARSAL-ALICE', email: 'alice@rehearsal.example.test', scope: 'SCOPE-A', business: 'VEN-A', count: 23 },
  { uid: 'REHEARSAL-BOB', email: 'bob@rehearsal.example.test', scope: 'SCOPE-A', business: 'VEN-B', count: 1 },
  { uid: 'REHEARSAL-CAROL', email: 'carol@rehearsal.example.test', scope: 'SCOPE-C', business: 'VEN-C', count: 1 },
  { uid: 'REHEARSAL-EMPTY', email: 'empty@rehearsal.example.test', scope: 'SCOPE-A', business: 'VEN-EMPTY', count: 0 },
  { uid: 'REHEARSAL-MISSING', email: 'missing@rehearsal.example.test', scope: 'SCOPE-A', business: 'VEN-MISSING', membership: false },
  { uid: 'REHEARSAL-INACTIVE', email: 'inactive@rehearsal.example.test', scope: 'SCOPE-A', business: 'VEN-INACTIVE', status: 'inactive' },
  { uid: 'REHEARSAL-MISMATCH', email: 'mismatch@rehearsal.example.test', scope: 'SCOPE-A', business: 'VEN-MISMATCH', claimScope: 'SCOPE-C' },
  { uid: 'REHEARSAL-DISABLED', email: 'disabled@rehearsal.example.test', scope: 'SCOPE-A', business: 'VEN-DISABLED' },
  { uid: 'REHEARSAL-STAFF', email: 'staff@rehearsal.example.test', scope: 'SCOPE-A', role: 'staff' },
  { uid: 'REHEARSAL-INSPECTOR', email: 'inspector@rehearsal.example.test', scope: 'SCOPE-A', role: 'inspector' }
];
export function syntheticInvoice(id, business, scope, status = 'Unpaid') {
  return { id, vendor_id: business, municipalScopeId: scope, slaughter_record_id: null,
    date_issued: '2026-10-01', due_date: '2026-10-15', number_of_heads_cow: 0, number_of_heads_pig: 2,
    corral_fee: 15, delivery_fee: 25, anti_mortem_fee: 10, facility_fee: 45,
    total_amount: 95, payment_status: status, notes: 'Synthetic emulator rehearsal only' };
}
export async function seed({ auth, db }) {
  const hosts = assertEmulators();
  // Cleanup is explicitly emulator-only and scoped to this dedicated demo ID.
  for (const url of [`http://${hosts.auth.address}/emulator/v1/projects/${PROJECT_ID}/accounts`,
    `http://${hosts.firestore.address}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`]) {
    const response = await fetch(url, { method: 'DELETE' });
    if (!response.ok) throw new Error('Could not reset dedicated rehearsal emulator');
  }
  const batch = db.batch();
  for (const user of USERS) {
    await auth.createUser({ uid: user.uid, email: user.email, password: PASSWORD, emailVerified: true });
    await auth.setCustomUserClaims(user.uid, { municipalRole: user.role || 'vendor', municipalScopeId: user.claimScope || user.scope });
    if (user.membership !== false) batch.set(db.doc(`mobile_memberships/${user.uid}`), {
      role: user.role || 'vendor', status: user.status || 'active', municipalScopeId: user.scope,
      ...(user.business ? { vendorBusinessId: user.business } : {})
    });
    if (user.business) batch.set(db.doc(`vendors/${user.business}`), { id: user.business,
      name: `Synthetic ${user.business}`, address: 'Synthetic address', contact_number: '000', email: user.email,
      animal_type: 'Pig', created_at: '2026-10-01', status: 'Active', municipalScopeId: user.scope });
    for (let index = 1; index <= (user.count || 0); index++) {
      const id = `INV-${user.business}-${String(index).padStart(3, '0')}`;
      batch.set(db.doc(`invoices/${id}`), syntheticInvoice(id, user.business, user.scope, ['Unpaid', 'Paid', 'Overdue'][(index - 1) % 3]));
    }
  }
  batch.set(db.doc('invoices/INV-CROSS-SCOPE'), syntheticInvoice('INV-CROSS-SCOPE', 'VEN-A', 'SCOPE-C'));
  const unscoped = syntheticInvoice('INV-UNSCOPED', 'VEN-A', 'SCOPE-A'); delete unscoped.municipalScopeId;
  batch.set(db.doc(`invoices/${unscoped.id}`), unscoped);
  await batch.commit();
}

export async function signIn(email) {
  const { auth } = assertEmulators();
  const response = await fetch(`http://${auth.address}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic-emulator-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true })
  });
  const body = await response.json();
  if (!response.ok || !body.idToken) throw new Error(`Synthetic login failed (${response.status})`);
  const payload = JSON.parse(Buffer.from(body.idToken.split('.')[1], 'base64url').toString());
  if (payload.aud !== PROJECT_ID) throw new Error('Unexpected token project');
  return body.idToken; // Tokens stay in memory and are never logged/exported.
}
