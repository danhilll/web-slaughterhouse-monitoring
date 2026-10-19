import { Router } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { EMAIL_VERIFICATION_REQUIRED, verifyFirebaseIdToken } from './access.js';
import { isValidHeadcount } from './headcounts.js';

const ROLES = new Set(['vendor', 'staff', 'inspector']);
const PAYMENT_STATUSES = new Set(['Paid', 'Unpaid', 'Overdue']);
const identifier = (v) => typeof v === 'string' && v.length > 0 && v === v.trim() &&
  Buffer.byteLength(v) <= 1500 && !v.includes('/') && !['.', '..'].includes(v);
const string = (v) => typeof v === 'string';
const amount = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const date = (v) => string(v) && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const error = (res, status, code, message) => res.status(status).json({ code, message });

// Read-only adapter. Never load the legacy unscoped full-collection store.
export function createMobileFirestoreStore(getDb) {
  const db = () => {
    const value = getDb();
    if (!value) throw new Error('Mobile database unavailable');
    return value;
  };
  const read = async (collection, id) => {
    const snapshot = await db().collection(collection).doc(id).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    // Fail closed rather than silently correcting a conflicting business ID.
    if (data.id !== undefined && data.id !== snapshot.id) throw new Error('Conflicting document ID');
    return { ...data, id: snapshot.id };
  };
  return {
    getMembership: (uid) => read('mobile_memberships', uid),
    getVendor: (id) => read('vendors', id),
    async listInvoices({ municipalScopeId, vendorBusinessId, after, limit }) {
      let query = db().collection('invoices')
        .where('municipalScopeId', '==', municipalScopeId)
        .where('vendor_id', '==', vendorBusinessId)
        .orderBy(FieldPath.documentId());
      if (after) query = query.startAfter(after);
      const snapshot = await query.limit(limit).get();
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        if (data.id !== undefined && data.id !== doc.id) throw new Error('Conflicting invoice ID');
        return { ...data, id: doc.id };
      });
    }
  };
}

function vendorView(vendor) {
  if (!identifier(vendor.id) || !string(vendor.name) || !vendor.name.trim() ||
      !['Cow', 'Pig', 'Both'].includes(vendor.animal_type) || !date(vendor.created_at) ||
      !['address', 'contact_number', 'email'].every((field) => string(vendor[field]))) {
    throw new Error('Invalid vendor schema');
  }
  return Object.fromEntries(['id', 'name', 'address', 'contact_number', 'email',
    'animal_type', 'created_at', 'status', 'municipalScopeId'].map((key) => [key, vendor[key]]));
}

function invoiceView(invoice, principal) {
  if (!identifier(invoice.id) || invoice.vendor_id !== principal.vendorBusinessId ||
      invoice.municipalScopeId !== principal.municipalScopeId ||
      !PAYMENT_STATUSES.has(invoice.payment_status) || !date(invoice.date_issued) || !date(invoice.due_date) ||
      !['number_of_heads_cow', 'number_of_heads_pig'].every((key) => isValidHeadcount(invoice[key])) ||
      !['corral_fee', 'delivery_fee', 'anti_mortem_fee', 'facility_fee', 'total_amount'].every((key) => amount(invoice[key])) ||
      !(invoice.slaughter_record_id === null || identifier(invoice.slaughter_record_id)) ||
      !['notes', 'vendor_name'].every((key) => invoice[key] === undefined || string(invoice[key]))) {
    throw new Error('Invalid or unauthorized invoice');
  }
  const keys = ['id', 'vendor_id', 'municipalScopeId', 'slaughter_record_id', 'date_issued', 'due_date',
    'number_of_heads_cow', 'number_of_heads_pig', 'corral_fee', 'delivery_fee', 'anti_mortem_fee',
    'facility_fee', 'total_amount', 'payment_status', 'notes', 'vendor_name'];
  return Object.fromEntries(keys.filter((key) => invoice[key] !== undefined).map((key) => [key, invoice[key]]));
}

// Factory keeps HTTP handlers testable without initializing Firebase or loading credentials.
export function createMobileRouter({ getAuth, store, production = null, cursorSecret, now = Date.now }) {
  if (production && !cursorSecret) throw new Error('Stable production cursor signing key is required.');
  cursorSecret ??= randomBytes(32);
  const router = Router();
  const sign = (value) => createHmac('sha256', cursorSecret).update(value).digest('base64url');
  const encode = (principal, after) => {
    const value = Buffer.from(JSON.stringify({ uid: principal.uid, scope: principal.municipalScopeId,
      vendor: principal.vendorBusinessId, after, expires: now() + 60 * 60 * 1000 })).toString('base64url');
    return `${value}.${sign(value)}`;
  };
  const decode = (cursor, principal) => {
    if (typeof cursor !== 'string' || cursor.length > 4096) throw new Error('Invalid cursor');
    const parts = cursor.split('.');
    if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0])) throw new Error('Invalid cursor');
    const expected = Buffer.from(sign(parts[0]));
    const actual = Buffer.from(parts[1]);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid cursor');
    const value = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (value.uid !== principal.uid || value.scope !== principal.municipalScopeId ||
        value.vendor !== principal.vendorBusinessId || !identifier(value.after) ||
        !Number.isFinite(value.expires) || value.expires <= now()) throw new Error('Invalid cursor');
    return value.after;
  };

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    // Terminal router: unsupported methods cannot fall through to administrator writes.
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.set('Allow', 'GET, HEAD');
      return error(res, 405, 'mobile_read_only', 'Mobile access is read-only.');
    }
    next();
  });
  router.use(async (req, res, next) => {
    const match = /^Bearer (\S+)$/i.exec(String(req.headers.authorization || ''));
    if (!match) return error(res, 401, 'invalid_session', 'Sign in is required.');
    try {
      const auth = getAuth();
      if (!auth) return error(res, 503, 'unavailable', 'Mobile authentication is unavailable.');
      // checkRevoked also rejects disabled users; project/audience validation is handled by Admin Auth.
      const token = await verifyFirebaseIdToken(auth, match[1]);
      if (!identifier(token.uid)) return error(res, 401, 'invalid_session', 'Your session is invalid.');
      const membership = await store.getMembership(token.uid);
      if (!membership || !ROLES.has(membership.role) || membership.status !== 'active' ||
          !identifier(membership.municipalScopeId) || (production && membership.municipalScopeId !== production.municipalScopeId) || token.municipalRole !== membership.role ||
          token.municipalScopeId !== membership.municipalScopeId ||
          (membership.role !== 'vendor' && membership.vendorBusinessId != null)) {
        return error(res, 403, 'access_denied', 'Your account has no approved mobile access.');
      }
      const principal = { uid: token.uid, role: membership.role, status: membership.status,
        municipalScopeId: membership.municipalScopeId };
      if (membership.role === 'vendor') {
        if (!identifier(membership.vendorBusinessId)) return error(res, 403, 'access_denied', 'Vendor access is unavailable.');
        const vendor = await store.getVendor(membership.vendorBusinessId);
        if (!vendor || vendor.id !== membership.vendorBusinessId || vendor.status !== 'Active' ||
            vendor.municipalScopeId !== membership.municipalScopeId) {
          return error(res, 403, 'access_denied', 'Vendor access is unavailable.');
        }
        principal.vendorBusinessId = membership.vendorBusinessId;
        principal.vendor = vendorView(vendor);
      }
      req.mobileUser = principal;
      next();
    } catch (failure) {
      if (failure?.code === EMAIL_VERIFICATION_REQUIRED) return error(res, 403, failure.code, failure.message);
      if (failure?.status === 401) return error(res, 401, 'invalid_session', 'Your session is invalid or expired.');
      return error(res, 503, 'unavailable', 'Mobile access is unavailable.');
    }
  });
  router.get('/me', (req, res) => {
    if (Object.keys(req.query).length) return error(res, 400, 'invalid_query', 'No profile selectors are supported.');
    res.json({ ...req.mobileUser, capabilities: { invoices: req.mobileUser.role === 'vendor', mutations: false } });
  });
  router.get('/invoices', async (req, res) => {
    const principal = req.mobileUser;
    if (principal.role !== 'vendor') return error(res, 403, 'policy_unavailable', 'Business access for this role is unavailable.');
    if (Object.keys(req.query).some((key) => !['limit', 'cursor'].includes(key))) {
      return error(res, 400, 'invalid_query', 'Only limit and cursor are supported.');
    }
    const raw = req.query.limit;
    if (raw !== undefined && (typeof raw !== 'string' || !/^[1-9]\d?$/.test(raw) || Number(raw) > 50)) {
      return error(res, 400, 'invalid_query', 'Limit must be an integer between 1 and 50.');
    }
    const limit = raw === undefined ? 20 : Number(raw);
    let after;
    try { if (req.query.cursor !== undefined) after = decode(req.query.cursor, principal); }
    catch { return error(res, 400, 'invalid_cursor', 'The page cursor is invalid or expired. Refresh invoices.'); }
    try {
      const rows = await store.listInvoices({ municipalScopeId: principal.municipalScopeId,
        vendorBusinessId: principal.vendorBusinessId, after, limit: limit + 1 });
      if (!Array.isArray(rows) || rows.length > limit + 1) throw new Error('Unbounded result');
      const views = rows.map((row) => invoiceView(row, principal));
      for (let index = 0; index < rows.length; index++) {
        const previous = index ? rows[index - 1].id : after;
        if (previous && Buffer.compare(Buffer.from(previous), Buffer.from(rows[index].id)) >= 0) throw new Error('Invalid order');
      }
      const items = views.slice(0, limit);
      res.json({ items, nextCursor: views.length > limit ? encode(principal, items.at(-1).id) : null });
    } catch {
      return error(res, 503, 'unavailable', 'Invoices are unavailable.');
    }
  });
  router.use((req, res) => error(res, 404, 'not_found', 'Mobile endpoint unavailable.'));
  return router;
}
