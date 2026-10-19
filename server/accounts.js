import { Router } from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { STAFF_PERMISSIONS } from './animals.js';

const roles = new Set(['vendor', 'staff', 'inspector']);
const id = (v) => typeof v === 'string' && v.length > 0 && v.length <= 128 && v === v.trim() && !v.includes('/') && !['.', '..'].includes(v);
const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (value, maximum) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximum;
const view = (a) => Object.fromEntries(['uid', 'fullName', 'email', 'contactNumber', 'role', 'staffPermissions', 'municipalScopeId', 'vendorBusinessId', 'status', 'invitationStatus', 'createdAt'].filter(k => a[k] !== undefined).map(k => [k, a[k]]));

export function createAccountStore(getDb) {
  const db = () => { const value = getDb(); if (!value) throw fail(503, 'Account storage is unavailable.'); return value; };
  const managed = uid => db().doc(`managed_accounts/${uid}`);
  return {
    async vendor(businessId) {
      const s = await db().doc(`vendors/${businessId}`).get();
      if (!s.exists) return null;
      if (s.data().id !== undefined && s.data().id !== s.id) throw fail(409, 'Vendor identity needs administrator review.');
      return { ...s.data(), id: s.id };
    },
    async createVendor(vendor, actor) {
      const normalize = v => v.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
      const key = createHash('sha256').update(JSON.stringify([vendor.municipalScopeId, normalize(vendor.marketName), normalize(vendor.marketSection), normalize(vendor.stallNumber)])).digest('hex');
      const assignment = db().doc(`market_stall_assignments/${key}`);
      await db().runTransaction(async tx => {
        const existing = await tx.get(assignment);
        if (existing.exists) throw fail(409, 'This market stall is already assigned. Review the existing vendor instead of registering it again.');
        tx.create(db().doc(`vendors/${vendor.id}`), vendor);
        tx.create(assignment, { vendorBusinessId: vendor.id, municipalScopeId: vendor.municipalScopeId, marketName: vendor.marketName, marketSection: vendor.marketSection, stallNumber: vendor.stallNumber });
        tx.create(db().collection('vendor_audit').doc(), { action: 'registered', actorUid: actor, vendorBusinessId: vendor.id, at: new Date().toISOString() });
      });
    },
    async get(uid) { const s = await managed(uid).get(); return s.exists ? { ...s.data(), uid: s.id } : null; },
    async list(scope, after) {
      let q = db().collection('managed_accounts').where('municipalScopeId', '==', scope).orderBy(FieldPath.documentId());
      if (after) q = q.startAfter(after);
      const result = await q.limit(26).get();
      return result.docs.map(d => ({ ...d.data(), uid: d.id }));
    },
    async audit(uid) {
      const result = await db().collection('account_audit').where('targetUid', '==', uid).orderBy('at', 'desc').limit(20).get();
      return result.docs.map(d => ({ action: d.data().action, actorUid: d.data().actorUid, at: d.data().at }));
    },
    async vendors(scope, after) {
      let q = db().collection('vendors').where('municipalScopeId', '==', scope).where('status', '==', 'Active').orderBy(FieldPath.documentId());
      if (after) q = q.startAfter(after);
      const result = await q.limit(26).get();
      return result.docs.map(d => ({ id: d.id, name: d.data().name, marketName: d.data().marketName || '', marketSection: d.data().marketSection || '', stallNumber: d.data().stallNumber || '' }));
    },
    async recordFailure(account) {
      await db().runTransaction(async tx => {
        const s = await tx.get(managed(account.uid));
        tx.set(managed(account.uid), { ...account, status: s.data()?.status === 'inactive' ? 'inactive' : 'provisioning_failed' });
      });
    },
    async prepare(account, actor) {
      const ref = db().doc(`account_email_reservations/${createHash('sha256').update(account.email).digest('hex')}`);
      await db().runTransaction(async tx => {
        const reserved = await tx.get(ref);
        if (reserved.exists) throw fail(409, 'Account setup already exists for this email. Review its status instead of creating it again.');
        tx.create(ref, { uid: account.uid, municipalScopeId: account.municipalScopeId });
        tx.create(managed(account.uid), account);
        tx.create(db().collection('account_audit').doc(), { action: 'setup_requested', actorUid: actor, targetUid: account.uid, at: account.createdAt });
      });
    },
    async reserveInvitation(uid, actor, at) {
      await db().runTransaction(async tx => {
        const snapshot = await tx.get(managed(uid));
        const a = snapshot.data();
        if (!a || !['active', 'pending'].includes(a.status)) throw fail(409, 'This account is not ready for an invitation.');
        if (a.lastInvitationAt && Date.parse(at) - Date.parse(a.lastInvitationAt) < 60000) throw fail(429, 'Wait one minute before resending an invitation.');
        tx.update(managed(uid), { invitationStatus: 'sending', lastInvitationAt: at });
        tx.create(db().collection('account_audit').doc(), { action: 'invitation_requested', actorUid: actor, targetUid: uid, at });
      });
    },
    async provision(account, actor) {
      await db().runTransaction(async tx => {
        const current = await tx.get(managed(account.uid));
        if (!current.exists || current.data().status !== 'provisioning') throw fail(409, 'Account setup was stopped.');
        if (account.role === 'vendor') {
          const s = await tx.get(db().doc(`vendors/${account.vendorBusinessId}`));
          if (!s.exists || s.data().status !== 'Active' || s.data().municipalScopeId !== account.municipalScopeId) throw fail(409, 'The vendor business is no longer eligible.');
        }
        tx.update(managed(account.uid), account);
        tx.create(db().doc(`Users/${account.uid}`), { fullName: account.fullName, email: account.email, role: account.role, status: 'pending', municipalScopeId: account.municipalScopeId, ...(account.contactNumber ? { contactNumber: account.contactNumber } : {}), ...(account.vendorBusinessId ? { vendorID: account.vendorBusinessId } : {}) });
        tx.create(db().doc(`mobile_memberships/${account.uid}`), { role: account.role, status: 'pending', municipalScopeId: account.municipalScopeId, ...(account.staffPermissions ? { staffPermissions: account.staffPermissions } : {}), ...(account.vendorBusinessId ? { vendorBusinessId: account.vendorBusinessId } : {}) });
        tx.create(db().collection('account_audit').doc(), { action: 'create', actorUid: actor, targetUid: account.uid, at: account.createdAt });
      });
    },
    async update(uid, patch, membershipStatus, actor, action) {
      await db().runTransaction(async tx => {
        const existing = await tx.get(managed(uid));
        if (!existing.exists) throw fail(404, 'Managed account not found.');
        if (action === 'provisioned' && existing.data().status !== 'provisioning') throw fail(409, 'Account setup was stopped.');
        const keepInactive = action === 'provisioning_failed' && existing.data().status === 'inactive';
        tx.update(managed(uid), keepInactive ? { ...patch, status: 'inactive' } : patch);
        if (membershipStatus) {
          const status = keepInactive ? 'inactive' : membershipStatus;
          tx.set(db().doc(`mobile_memberships/${uid}`), { status }, { merge: true });
          tx.set(db().doc(`Users/${uid}`), { status }, { merge: true });
        }
        tx.create(db().collection('account_audit').doc(), { action, actorUid: actor, targetUid: uid, at: new Date().toISOString() });
      });
    },
    async activate(uid, scope, actor, checkIdentity) {
      await db().runTransaction(async tx => {
        const a = (await tx.get(managed(uid))).data();
        const membership = db().doc(`mobile_memberships/${uid}`), user = db().doc(`Users/${uid}`);
        const m = (await tx.get(membership)).data(), u = (await tx.get(user)).data();
        if (!a || a.uid !== uid || !roles.has(a.role) ||
            [a, m, u].some(row => !row || row.role !== a.role || row.status !== 'pending' || row.municipalScopeId !== scope) ||
            !text(a.email, 254) || u.email !== a.email) throw fail(409, 'Only matching pending mobile accounts can be activated.');
        if (a.role === 'vendor') {
          if (!id(a.vendorBusinessId) || m.vendorBusinessId !== a.vendorBusinessId || u.vendorID !== a.vendorBusinessId ||
              a.vendorID !== undefined || m.vendorID !== undefined || u.vendorBusinessId !== undefined) throw fail(409, 'Vendor assignment needs administrator review.');
          const business = await tx.get(db().doc(`vendors/${a.vendorBusinessId}`));
          const v = business.data();
          if (!v || (v.id !== undefined && v.id !== a.vendorBusinessId) || v.status !== 'Active' || v.municipalScopeId !== scope) throw fail(409, 'Vendor business needs administrator ownership approval.');
        } else if ([a, m, u].some(row => row.vendorBusinessId !== undefined || row.vendorID !== undefined)) {
          throw fail(409, 'Only vendors can have a business assignment.');
        }
        const permissions = a.staffPermissions ?? [], assigned = m.staffPermissions ?? [];
        if ([permissions, assigned].some(p => !Array.isArray(p) || p.length > STAFF_PERMISSIONS.length || new Set(p).size !== p.length || p.some(value => !STAFF_PERMISSIONS.includes(value))) ||
            permissions.length !== assigned.length || permissions.some(p => !assigned.includes(p)) ||
            (a.role === 'staff' ? permissions.length === 0 : permissions.length !== 0)) throw fail(409, 'Review and save explicit staff functions before activation.');
        // Auth is read-only. A failed identity check cannot open membership;
        // Firestore retries recheck all records and Auth before committing.
        await checkIdentity(a);
        tx.update(managed(uid), { status: 'active' });
        tx.update(membership, { status: 'active' });
        tx.update(user, { status: 'active' });
        tx.create(db().collection('account_audit').doc(), { action: 'activated', actorUid: actor, targetUid: uid, at: new Date().toISOString() });
      });
    },
    async staffPermissions(uid, permissions, scope, actor) {
      await db().runTransaction(async tx => {
        const a = await tx.get(managed(uid));
        const m = await tx.get(db().doc(`mobile_memberships/${uid}`));
        if (!a.exists || !m.exists || a.data().role !== 'staff' || m.data().role !== 'staff' || a.data().municipalScopeId !== scope || m.data().municipalScopeId !== scope || !['active','pending'].includes(a.data().status)) throw fail(409, 'Only prepared staff accounts can have staff functions assigned.');
        tx.update(managed(uid), { staffPermissions: permissions });
        tx.update(m.ref, { staffPermissions: permissions });
        tx.create(db().collection('account_audit').doc(), { action: 'staff_permissions_changed', actorUid: actor, targetUid: uid, before: m.data().staffPermissions || [], after: permissions, at: new Date().toISOString() });
      });
    }
  };
}

// Firebase sends the password setup email. Neither a password nor an actionable
// reset link is returned to the administrator or recorded in the directory.
export function createFirebaseInvitationSender({ apiKey, emulatorHost, fetchImpl = fetch }) {
  return async email => {
    if (!apiKey) throw fail(503, 'Invitation delivery is not configured.');
    if (emulatorHost && !/^127\.0\.0\.1:\d+$/.test(emulatorHost)) throw fail(503, 'Invalid invitation emulator host.');
    const origin = emulatorHost ? `http://${emulatorHost}` : 'https://identitytoolkit.googleapis.com';
    const path = emulatorHost ? '/identitytoolkit.googleapis.com/v1/accounts:sendOobCode' : '/v1/accounts:sendOobCode';
    const response = await fetchImpl(`${origin}${path}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestType: 'PASSWORD_RESET', email })
    });
    if (!response.ok) throw fail(503, 'Invitation delivery failed. You can retry from Users.');
  };
}

// Must be mounted after web administrator authentication, before the separately
// paused business-write routes. No role/admin assignment is accepted from clients.
export function createAccountsRouter({ getAuth, store, enabled = false, activationEnabled = false, production = null, scope = '', municipalityName = '', adminUids = new Set(), sendInvitation, now = () => new Date().toISOString() }) {
  const router = Router();
  if (production && scope !== production.municipalScopeId) throw new Error('Production account scope must match the manifest.');
  if (production) { enabled = production.features.accountManagement; activationEnabled = production.features.activation; }
  const readEnabled = production ? true : enabled;
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.webUser || !adminUids.has(req.webUser.uid)) return res.status(403).json({ message: 'Web administrator access is required.' });
    next();
  });
  router.get('/settings', (req, res) => res.json({ enabled: readEnabled && id(scope), canManageAccounts: enabled && id(scope), canDeactivate: readEnabled && id(scope), municipalScopeId: id(scope) ? scope : null, municipalityName, roles: [...roles], staffInspectorAvailable: readEnabled && id(scope) && activationEnabled, canActivateAccounts: readEnabled && id(scope) && activationEnabled }));
  router.use((req, res, next) => {
    if (!readEnabled || !id(scope)) return res.status(503).json({ message: 'Account management is awaiting approved municipal setup.' });
    next();
  });
  const writeGate=feature=>(req,res,next)=>production&&production.features[feature]!==true
    ?res.status(503).json({message:'This production account capability is paused.'}):next();
  router.use((req, res, next) => {
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) return res.status(405).json({ message: 'Unsupported account operation.' });
    next();
  });
  const run = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
      const conflict = ['auth/email-already-exists', 'auth/uid-already-exists'].includes(e.code);
      const status = conflict ? 409 : (e.status || 503);
      res.status(status).json({ message: conflict ? 'An account already uses this email. Existing accounts are not changed; contact the administrator to review it.' : (e.status ? e.message : 'Account operation could not finish. Review the account status before retrying.') });
    }
  };
  const auth = () => { const a = getAuth(); if (!a) throw fail(503, 'Authentication is unavailable.'); return a; };
  const owned = async uid => {
    if (!id(uid)) throw fail(400, 'Invalid account ID.');
    const a = await store.get(uid);
    if (!a || a.municipalScopeId !== scope) throw fail(404, 'Managed account not found.');
    if (adminUids.has(uid)) throw fail(409, 'Existing web administrator accounts are protected.');
    return a;
  };
  const invite = async (account, actor) => {
    if (!['active', 'pending'].includes(account.status)) throw fail(409, 'This account is not ready for an invitation.');
    if (account.lastInvitationAt && Date.parse(now()) - Date.parse(account.lastInvitationAt) < 60000) throw fail(429, 'Wait one minute before resending an invitation.');
    // Reserve the attempt before delivery. Failures do not roll back identity or
    // silently create another user; the existing directory record can be retried.
    await store.reserveInvitation(account.uid, actor, now());
    try {
      await sendInvitation(account.email);
      await store.update(account.uid, { invitationStatus: 'sent' }, null, actor, 'invitation_sent');
      return 'sent';
    } catch {
      await store.update(account.uid, { invitationStatus: 'failed' }, null, actor, 'invitation_failed');
      return 'failed';
    }
  };
  router.get('/', run(async (req, res) => {
    if (Object.keys(req.query).some(k => k !== 'after') || (req.query.after !== undefined && !id(req.query.after))) throw fail(400, 'Invalid account pagination.');
    const rows = await store.list(scope, req.query.after);
    const items = rows.slice(0, 25);
    res.json({ items: items.map(view), nextCursor: rows.length > 25 ? items.at(-1).uid : null });
  }));
  router.get('/vendors', run(async (req, res) => {
    if (Object.keys(req.query).some(k => k !== 'after') || (req.query.after !== undefined && !id(req.query.after))) throw fail(400, 'Invalid vendor pagination.');
    const rows = await store.vendors(scope, req.query.after);
    const items = rows.slice(0, 25);
    res.json({ items, nextCursor: rows.length > 25 ? items.at(-1).id : null });
  }));
  router.post('/vendors', writeGate('accountManagement'), run(async (req, res) => {
    const b = req.body || {};
    const fields = ['name', 'address', 'contact_number', 'email', 'animal_type', 'marketName', 'marketSection', 'stallNumber'];
    if (Object.keys(b).some(k => !fields.includes(k)) || !text(b.name, 120) || !text(b.address, 300) ||
        !text(b.contact_number, 32) || !/^[+\d\s()-]+$/.test(b.contact_number) || !/\d{7}/.test(b.contact_number.replace(/\D/g, '')) ||
        !text(b.email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim()) ||
        !['Cow', 'Pig', 'Both'].includes(b.animal_type) || !text(b.marketName, 120) || !text(b.marketSection, 80) || !text(b.stallNumber, 40)) {
      throw fail(400, 'Enter complete business, contact and market stall details.');
    }
    const vendor = Object.fromEntries(fields.map(k => [k, b[k].trim()]));
    vendor.email = vendor.email.toLowerCase();
    vendor.id = `VEN-${randomUUID()}`;
    vendor.status = 'Active'; vendor.municipalScopeId = scope;
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now()));
    vendor.created_at = ['year', 'month', 'day'].map(type => parts.find(p => p.type === type).value).join('-');
    await store.createVendor(vendor, req.webUser.uid);
    res.status(201).json({ vendor, message: 'Vendor business registered. Its ID remains the same if stall assignments change later.' });
  }));
  router.post('/', writeGate('accountManagement'), run(async (req, res) => {
    const body = req.body || {};
    if (Object.keys(body).some(k => !['fullName', 'email', 'role', 'vendorBusinessId', 'contactNumber', 'staffPermissions'].includes(k))) throw fail(400, 'Unsupported account field.');
    const permissions = body.staffPermissions ?? [];
    if (!Array.isArray(permissions) || permissions.length > 3 || new Set(permissions).size !== permissions.length || permissions.some(p => !STAFF_PERMISSIONS.includes(p)) || (body.role !== 'staff' && permissions.length)) throw fail(400, 'Select supported permissions for staff accounts only.');
    const contactNumber = typeof body.contactNumber === 'string' ? body.contactNumber.trim() : '';
    if (body.contactNumber !== undefined && (typeof body.contactNumber !== 'string' || (contactNumber && (contactNumber.length > 32 || !/^[+\d\s()-]+$/.test(contactNumber) || !/\d{7}/.test(contactNumber.replace(/\D/g, '')))))) throw fail(400, 'Enter a valid contact number or leave it blank.');
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!fullName || fullName.length > 120 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !roles.has(body.role)) throw fail(400, 'Enter a valid name, email and supported role.');
    if (body.role === 'vendor') {
      if (!id(body.vendorBusinessId)) throw fail(400, 'Select an approved vendor business.');
      const vendor = await store.vendor(body.vendorBusinessId);
      if (!vendor || vendor.id !== body.vendorBusinessId || vendor.status !== 'Active' || vendor.municipalScopeId !== scope) throw fail(409, 'The vendor must be active and belong to this municipality.');
    } else if (body.vendorBusinessId) throw fail(400, 'Only vendors can have a vendor business link.');
    const firebase = auth();
    try {
      await firebase.getUserByEmail(email);
      throw fail(409, 'An account already uses this email. Existing accounts require a separate ownership review.');
    } catch (e) { if (e.code !== 'auth/user-not-found') throw e; }
    const uid = `MOB-${randomUUID()}`;
    // Unusable, undisclosed bootstrap password. User chooses their own through
    // Firebase's setup email; no password field exists in the treasurer form.
    const account = { uid, fullName, email, role: body.role, municipalScopeId: scope, status: 'provisioning', invitationStatus: 'not_sent', createdAt: now(), ...(body.role === 'staff' ? { staffPermissions: permissions } : {}), ...(contactNumber ? { contactNumber } : {}), ...(body.role === 'vendor' ? { vendorBusinessId: body.vendorBusinessId } : {}) };
    await store.prepare(account, req.webUser.uid);
    let recorded = false;
    try {
      await firebase.createUser({ uid, email, displayName: fullName, password: randomBytes(32).toString('base64url'), disabled: true, emailVerified: false });
      await store.provision(account, req.webUser.uid); recorded = true;
      const existing = await firebase.getUser(uid);
      await firebase.setCustomUserClaims(uid, { ...existing.customClaims, municipalRole: body.role, municipalScopeId: scope });
      await firebase.updateUser(uid, { disabled: false });
      account.status = 'pending';
      await store.update(uid, { status: account.status }, account.status, req.webUser.uid, 'provisioned');
    } catch (failure) {
      // Never delete a possibly provisioned identity. Make partial work visible
      // and fail closed; protected membership remains pending until all steps pass.
      try { await firebase.updateUser(uid, { disabled: true }); } catch { /* membership remains closed */ }
      if (recorded) await store.update(uid, { status: 'provisioning_failed' }, 'pending', req.webUser.uid, 'provisioning_failed');
      else await store.recordFailure(account);
      throw failure;
    }
    account.invitationStatus = await invite(account, req.webUser.uid);
    res.status(201).json({ account: view(account), message: account.invitationStatus === 'sent' ? 'Account created. Firebase accepted the password setup email request; inbox delivery is not guaranteed.' : 'Account created, but the invitation failed. Retry from Users after one minute.' });
  }));
  router.post('/:uid/invitation', writeGate('accountManagement'), run(async (req, res) => {
    if (Object.keys(req.body || {}).length) throw fail(400, 'Invitation requests do not accept account changes.');
    const a = await owned(req.params.uid);
    res.json({ invitationStatus: await invite(a, req.webUser.uid) });
  }));
  router.post('/:uid/activate', writeGate('activation'), run(async (req, res) => {
    if (!activationEnabled) throw fail(503, 'Mobile activation is awaiting approved municipal setup.');
    if (Object.keys(req.body || {}).length) throw fail(400, 'Activation requests do not accept account changes.');
    const a = await owned(req.params.uid);
    await store.activate(a.uid, scope, req.webUser.uid, async account => {
      let identity;
      try { identity = await auth().getUser(account.uid); }
      catch (e) { if (e.code === 'auth/user-not-found') throw fail(409, 'Account identity needs administrator review.'); throw e; }
      if (!identity || identity.uid !== account.uid || identity.disabled !== false || identity.email !== account.email ||
          identity.customClaims?.municipalRole !== account.role || identity.customClaims?.municipalScopeId !== scope) throw fail(409, 'Account identity needs administrator review.');
    });
    res.json({ success: true, message: 'Membership approved with the existing role and assigned functions. Access also requires Firebase email verification.' });
  }));
  router.post('/:uid/permissions', writeGate('accountManagement'), run(async (req, res) => {
    const b = req.body || {}, permissions = b.staffPermissions;
    if (Object.keys(b).some(k => k !== 'staffPermissions') || !Array.isArray(permissions) || permissions.length > 3 || new Set(permissions).size !== permissions.length || permissions.some(p => !STAFF_PERMISSIONS.includes(p))) throw fail(400, 'Choose supported staff functions.');
    const a = await owned(req.params.uid);
    if (a.role !== 'staff') throw fail(409, 'Staff functions apply to staff accounts only.');
    await store.staffPermissions(a.uid, permissions, scope, req.webUser.uid);
    res.json({ success: true, message: 'Staff functions updated. Existing access status is unchanged.' });
  }));
  router.get('/:uid/audit', run(async (req, res) => {
    const a = await owned(req.params.uid);
    res.json({ items: await store.audit(a.uid) });
  }));
  router.post('/:uid/deactivate', run(async (req, res) => {
    if (Object.keys(req.body || {}).length) throw fail(400, 'Deactivation requests do not accept account changes.');
    const a = await owned(req.params.uid);
    // Membership first: next mobile request is denied even if Auth is unavailable.
    await store.update(a.uid, { status: 'inactive' }, 'inactive', req.webUser.uid, 'deactivated');
    try { await auth().updateUser(a.uid, { disabled: true }); await auth().revokeRefreshTokens(a.uid); }
    catch { throw fail(503, 'Mobile access was deactivated, but Firebase session cleanup needs administrator retry.'); }
    res.json({ success: true });
  }));
  router.use((req, res) => res.status(404).json({ message: 'Account operation not found.' }));
  return router;
}
