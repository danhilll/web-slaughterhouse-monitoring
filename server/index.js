import express from 'express';
import cors from 'cors';

const app = express();
const requestedPort = Number(process.argv[2] || process.env.PORT || 5000);
const PORT = Number.isFinite(requestedPort) ? requestedPort : 5000;
const MUNICIPALITY = 'San Fernando';

// Collision-free prefixed IDs (B9). Timestamp (base36, ~monotonic) + 5 random
// chars: unique under same-ms double-clicks, no new dependency, and prefixed
// per collection so VEN/SR/INV/NOT stay distinguishable like the seeds.
const newId = (prefix) => {
  const time = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase().padEnd(5, 'X');
  return `${prefix}-${time}${rand}`;
};

// Shared input validators (B10). POST routes reject bad references instead of
// storing orphan rows that render as 'Unknown Vendor'.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(new Date(value).getTime());
const ANIMAL_TYPES = ['Cow', 'Pig', 'Both'];
const RECORD_STATUSES = ['Pending', 'Completed', 'Cancelled'];
const PAYMENT_STATUSES = ['Paid', 'Unpaid', 'Overdue'];
const isNonNegativeNumber = (value) => {
  if (value === null || value === undefined || value === '') return true; // optional field
  const num = Number(value);
  return Number.isFinite(num) && num >= 0;
};

// Pagination decision (B16): frontend paginates client-side (pageSize 10),
// which is fine at demo scale, so full cursor paging is deferred until a
// collection exceeds ~500 docs. Meanwhile every list endpoint accepts an
// OPTIONAL ?limit=1..500 guardrail — omitted (all current callers) means
// "all", so behavior is unchanged. This caps Firestore read fan-out
// (cost) for future direct/mobile callers.
const MAX_LIST_LIMIT = 500;
const applyLimit = (list, req, res) => {
  const raw = req.query.limit;
  if (raw === undefined) return { list, error: null };
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    return { list: null, error: `Limit must be an integer between 1 and ${MAX_LIST_LIMIT}.` };
  }
  return { list: list.slice(0, limit), error: null };
};

// CORS (B15): open in local dev (same as before). Set CORS_ORIGIN to a
// comma-separated allowlist in production, e.g.
// CORS_ORIGIN=https://your-app.web.app,https://your-office.gov.ph
const corsOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(corsOrigins.length > 0 ? cors({ origin: corsOrigins }) : cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Persistence: Firestore (via firebase-admin) when service credentials are
// present, otherwise the original in-memory seed dataset (local development).
// Set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
// (or GOOGLE_APPLICATION_CREDENTIALS) to enable Firestore mode.
// ---------------------------------------------------------------------------
const COLLECTIONS = {
  vendors: 'vendors',
  slaughterRecords: 'slaughter_records',
  invoices: 'invoices',
  notifications: 'notifications'
};
const SERVICE_FEES_DOC = 'config/serviceFees';

const seedFeeConfig = [
  { id: 'corral_casket_fee', label: 'Corral/Casket Fee', amount: 15 },
  { id: 'delivery_fee', label: 'Delivery Fee', amount: 25 },
  { id: 'anti_mortem_fee', label: 'Anti/Post Mortem Fee', amount: 10 },
  { id: 'facility_fee', label: 'Facility Fee', amount: 45 }
];

const seedVendors = [
  {
    id: 'VEN-1001',
    name: 'Nayon Meat Trading',
    address: 'Bacolod Street, Poblacion',
    contact_number: '0917-123-4455',
    email: 'nayonmeat@gmail.com',
    animal_type: 'Both',
    created_at: '2026-08-01',
    status: 'Active'
  },
  {
    id: 'VEN-1002',
    name: 'Mabini Livestock Supply',
    address: 'Rizal Avenue, Barangay 1',
    contact_number: '0922-441-9980',
    email: 'mabini.livestock@yahoo.com',
    animal_type: 'Cow',
    created_at: '2026-08-10',
    status: 'Active'
  },
  {
    id: 'VEN-1003',
    name: 'Kusina ng Hapag',
    address: 'San Vicente Road',
    contact_number: '0933-642-2210',
    email: 'kusinanghapag@gmail.com',
    animal_type: 'Pig',
    created_at: '2026-08-18',
    status: 'Inactive'
  }
];

const seedSlaughterRecords = [
  {
    id: 'SR-2001',
    vendor_id: 'VEN-1001',
    date: '2026-09-03',
    animal_type: 'Cow',
    number_of_heads: 12,
    meat_type_to_deliver: 'Dressed',
    livestock_type: 'Native',
    kilograms_cow: 220,
    kilograms_pig: null,
    status: 'Completed',
    created_at: '2026-09-03T08:10:00.000Z'
  },
  {
    id: 'SR-2002',
    vendor_id: 'VEN-1002',
    date: '2026-09-02',
    animal_type: 'Pig',
    number_of_heads: 7,
    meat_type_to_deliver: 'Cuts',
    livestock_type: 'Local Bred',
    kilograms_cow: null,
    kilograms_pig: 138,
    status: 'Pending',
    created_at: '2026-09-02T12:40:00.000Z'
  },
  {
    id: 'SR-2003',
    vendor_id: 'VEN-1001',
    date: '2026-09-01',
    animal_type: 'Both',
    number_of_heads: 18,
    meat_type_to_deliver: 'Whole',
    livestock_type: 'Imported',
    kilograms_cow: 300,
    kilograms_pig: 220,
    status: 'Completed',
    created_at: '2026-09-01T09:15:00.000Z'
  },
  {
    id: 'SR-2004',
    vendor_id: 'VEN-1003',
    date: '2026-08-28',
    animal_type: 'Pig',
    number_of_heads: 9,
    meat_type_to_deliver: 'Dressed',
    livestock_type: 'Local Bred',
    kilograms_cow: null,
    kilograms_pig: 170,
    status: 'Cancelled',
    created_at: '2026-08-28T07:10:00.000Z'
  }
];

const seedInvoices = [
  {
    id: 'INV-3001',
    vendor_id: 'VEN-1001',
    slaughter_record_id: 'SR-2001',
    date_issued: '2026-09-03',
    due_date: '2026-09-03',
    number_of_heads_cow: 12,
    number_of_heads_pig: 0,
    corral_fee: 180,
    delivery_fee: 300,
    anti_mortem_fee: 120,
    facility_fee: 540,
    total_amount: 1140,
    payment_status: 'Unpaid',
    notes: 'Service fee due today.'
  },
  {
    id: 'INV-3002',
    vendor_id: 'VEN-1002',
    slaughter_record_id: 'SR-2002',
    date_issued: '2026-09-02',
    due_date: '2026-09-02',
    number_of_heads_cow: 0,
    number_of_heads_pig: 7,
    corral_fee: 105,
    delivery_fee: 175,
    anti_mortem_fee: 70,
    facility_fee: 315,
    total_amount: 665,
    payment_status: 'Paid',
    notes: 'Payment settled in full.'
  },
  {
    id: 'INV-3003',
    vendor_id: 'VEN-1001',
    slaughter_record_id: 'SR-2003',
    date_issued: '2026-09-01',
    due_date: '2026-09-01',
    number_of_heads_cow: 10,
    number_of_heads_pig: 8,
    corral_fee: 270,
    delivery_fee: 450,
    anti_mortem_fee: 180,
    facility_fee: 810,
    total_amount: 1710,
    payment_status: 'Overdue',
    notes: 'Past due; no payment received.'
  }
];

const seedNotifications = [
  {
    id: 'NOT-4001',
    type: 'warning',
    message: 'Invoice INV-3001 is still unpaid after the slaughter date.',
    is_read: false,
    created_at: '2026-09-03T08:45:00.000Z'
  },
  {
    id: 'NOT-4002',
    type: 'alert',
    message: 'Invoice INV-3003 is overdue and requires collection before close of day.',
    is_read: false,
    created_at: '2026-09-01T13:15:00.000Z'
  },
  {
    id: 'NOT-4003',
    type: 'info',
    message: 'New slaughter record SR-2003 was added and is ready for billing review.',
    is_read: true,
    created_at: '2026-09-01T09:15:00.000Z'
  }
];

// In-memory fallback (original behavior). Deep-cloned from seeds so the
// exported seeds stay pristine for Firestore bootstrapping (B6).
const memory = {
  feeConfig: JSON.parse(JSON.stringify(seedFeeConfig)),
  vendors: JSON.parse(JSON.stringify(seedVendors)),
  slaughterRecords: JSON.parse(JSON.stringify(seedSlaughterRecords)),
  invoices: JSON.parse(JSON.stringify(seedInvoices)),
  notifications: JSON.parse(JSON.stringify(seedNotifications))
};

let firestoreDb = null;
let useFirestore = false;

const hasServiceCredentials = () => {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return true;
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
};

const initFirestore = async () => {
  if (!hasServiceCredentials()) return false;
  try {
    const admin = (await import('firebase-admin')).default;
    if (admin.apps.length === 0) {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId: process.env.FIREBASE_PROJECT_ID
        });
      } else {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: String(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n')
          })
        });
      }
    }
    firestoreDb = admin.firestore();
    return true;
  } catch (error) {
    console.warn('[api] Firestore init failed, using in-memory store:', error?.message || error);
    firestoreDb = null;
    return false;
  }
};

const docData = (doc) => ({ id: doc.id, ...doc.data() });

// --- Store: identical async interface for both backends --------------------
const store = {
  async listFees() {
    if (useFirestore) {
      const snap = await firestoreDb.doc(SERVICE_FEES_DOC).get();
      if (snap.exists && Array.isArray(snap.data().fees)) return snap.data().fees;
      return JSON.parse(JSON.stringify(seedFeeConfig));
    }
    return memory.feeConfig;
  },
  async saveFees(fees) {
    if (useFirestore) {
      await firestoreDb.doc(SERVICE_FEES_DOC).set(
        { fees, updated_at: new Date().toISOString() },
        { merge: true }
      );
    } else {
      memory.feeConfig.splice(0, memory.feeConfig.length, ...fees);
    }
    return fees;
  },
  async listVendors() {
    if (useFirestore) {
      const snap = await firestoreDb.collection(COLLECTIONS.vendors).get();
      return snap.docs.map(docData);
    }
    return memory.vendors;
  },
  async getVendor(id) {
    if (useFirestore) {
      const snap = await firestoreDb.collection(COLLECTIONS.vendors).doc(id).get();
      return snap.exists ? docData(snap) : null;
    }
    return memory.vendors.find((item) => item.id === id) || null;
  },
  async saveVendor(vendor) {
    if (useFirestore) {
      await firestoreDb.collection(COLLECTIONS.vendors).doc(vendor.id).set(vendor, { merge: false });
    } else {
      memory.vendors.push(vendor);
    }
    return vendor;
  },
  async updateVendor(id, patch) {
    if (useFirestore) {
      const ref = firestoreDb.collection(COLLECTIONS.vendors).doc(id);
      const snap = await ref.get();
      if (!snap.exists) return null;
      await ref.update(patch);
      return { id, ...snap.data(), ...patch };
    }
    const vendor = memory.vendors.find((item) => item.id === id);
    if (!vendor) return null;
    Object.assign(vendor, patch);
    return vendor;
  },
  async listRecords() {
    if (useFirestore) {
      const snap = await firestoreDb.collection(COLLECTIONS.slaughterRecords).get();
      return snap.docs.map(docData);
    }
    return memory.slaughterRecords;
  },
  async getRecord(id) {
    if (useFirestore) {
      const snap = await firestoreDb.collection(COLLECTIONS.slaughterRecords).doc(id).get();
      return snap.exists ? docData(snap) : null;
    }
    return memory.slaughterRecords.find((item) => item.id === id) || null;
  },
  async saveRecord(record, prepend = true) {
    if (useFirestore) {
      await firestoreDb.collection(COLLECTIONS.slaughterRecords).doc(record.id).set(record, { merge: false });
    } else if (prepend) {
      memory.slaughterRecords.unshift(record);
    } else {
      memory.slaughterRecords.push(record);
    }
    return record;
  },
  async updateRecord(id, patch) {
    if (useFirestore) {
      const ref = firestoreDb.collection(COLLECTIONS.slaughterRecords).doc(id);
      const snap = await ref.get();
      if (!snap.exists) return null;
      await ref.update(patch);
      return { id, ...snap.data(), ...patch };
    }
    const record = memory.slaughterRecords.find((item) => item.id === id);
    if (!record) return null;
    Object.assign(record, patch);
    return record;
  },
  async deleteRecord(id) {
    if (useFirestore) {
      const ref = firestoreDb.collection(COLLECTIONS.slaughterRecords).doc(id);
      const snap = await ref.get();
      if (!snap.exists) return false;
      await ref.delete();
      return true;
    }
    const index = memory.slaughterRecords.findIndex((item) => item.id === id);
    if (index === -1) return false;
    memory.slaughterRecords.splice(index, 1);
    return true;
  },
  async listInvoices() {
    if (useFirestore) {
      const snap = await firestoreDb.collection(COLLECTIONS.invoices).get();
      return snap.docs.map(docData);
    }
    return memory.invoices;
  },
  async getInvoice(id) {
    if (useFirestore) {
      const snap = await firestoreDb.collection(COLLECTIONS.invoices).doc(id).get();
      return snap.exists ? docData(snap) : null;
    }
    return memory.invoices.find((item) => item.id === id) || null;
  },
  async saveInvoice(invoice, prepend = true) {
    if (useFirestore) {
      await firestoreDb.collection(COLLECTIONS.invoices).doc(invoice.id).set(invoice, { merge: false });
    } else if (prepend) {
      memory.invoices.unshift(invoice);
    } else {
      memory.invoices.push(invoice);
    }
    return invoice;
  },
  async updateInvoice(id, patch) {
    if (useFirestore) {
      const ref = firestoreDb.collection(COLLECTIONS.invoices).doc(id);
      const snap = await ref.get();
      if (!snap.exists) return null;
      await ref.update(patch);
      return { id, ...snap.data(), ...patch };
    }
    const invoice = memory.invoices.find((item) => item.id === id);
    if (!invoice) return null;
    Object.assign(invoice, patch);
    return invoice;
  },
  async deleteInvoice(id) {
    if (useFirestore) {
      const ref = firestoreDb.collection(COLLECTIONS.invoices).doc(id);
      const snap = await ref.get();
      if (!snap.exists) return false;
      await ref.delete();
      return true;
    }
    const index = memory.invoices.findIndex((item) => item.id === id);
    if (index === -1) return false;
    memory.invoices.splice(index, 1);
    return true;
  },
  async listNotifications() {
    if (useFirestore) {
      const snap = await firestoreDb.collection(COLLECTIONS.notifications).get();
      return snap.docs.map(docData);
    }
    return memory.notifications;
  },
  async getNotification(id) {
    if (useFirestore) {
      const snap = await firestoreDb.collection(COLLECTIONS.notifications).doc(id).get();
      return snap.exists ? docData(snap) : null;
    }
    return memory.notifications.find((item) => item.id === id) || null;
  },
  async saveNotification(notification) {
    if (useFirestore) {
      await firestoreDb.collection(COLLECTIONS.notifications).doc(notification.id).set(notification, { merge: false });
    } else {
      memory.notifications.unshift(notification);
    }
    return notification;
  },
  async deleteNotification(id) {
    if (useFirestore) {
      const ref = firestoreDb.collection(COLLECTIONS.notifications).doc(id);
      const snap = await ref.get();
      if (!snap.exists) return false;
      await ref.delete();
      return true;
    }
    const index = memory.notifications.findIndex((item) => item.id === id);
    if (index === -1) return false;
    memory.notifications.splice(index, 1);
    return true;
  },
  async markAllNotificationsRead() {
    if (useFirestore) {
      const snap = await firestoreDb.collection(COLLECTIONS.notifications).where('is_read', '==', false).get();
      const batch = firestoreDb.batch();
      snap.docs.forEach((doc) => batch.update(doc.ref, { is_read: true }));
      await batch.commit();
    } else {
      memory.notifications.forEach((item) => {
        item.is_read = true;
      });
    }
  }
};

const getFeeAmounts = async () => {
  const feeConfig = await store.listFees();
  const find = (id, fallback) => {
    const entry = feeConfig.find((f) => f.id === id);
    const val = entry ? Number(entry.amount) : fallback;
    return Number.isFinite(val) && val >= 0 ? val : fallback;
  };
  return {
    corral: find('corral_casket_fee', 15),
    delivery: find('delivery_fee', 25),
    antiMortem: find('anti_mortem_fee', 10),
    facility: find('facility_fee', 45)
  };
};

const totalPerHead = async () => {
  const f = await getFeeAmounts();
  return f.corral + f.delivery + f.antiMortem + f.facility;
};

const computeFeeBreakdown = async (cowHeads = 0, pigHeads = 0) => {
  const fees = await getFeeAmounts();
  const totalHeads = Number(cowHeads || 0) + Number(pigHeads || 0);
  const corralFee = totalHeads * fees.corral;
  const deliveryFee = totalHeads * fees.delivery;
  const antiMortemFee = totalHeads * fees.antiMortem;
  const facilityFee = totalHeads * fees.facility;
  const totalAmount = totalHeads * (fees.corral + fees.delivery + fees.antiMortem + fees.facility);

  return {
    number_of_heads_cow: Number(cowHeads || 0),
    number_of_heads_pig: Number(pigHeads || 0),
    corral_fee: corralFee,
    delivery_fee: deliveryFee,
    anti_mortem_fee: antiMortemFee,
    facility_fee: facilityFee,
    total_amount: totalAmount
  };
};

const withVendor = (vendorList) => (entity) => {
  const vendor = vendorList.find((item) => item.id === entity.vendor_id);
  return {
    ...entity,
    vendor_name: vendor ? vendor.name : 'Unknown Vendor'
  };
};

// Business dates are Asia/Manila wall-clock (B12), never server/UTC dates.
// YYYY-MM-DD strings sort and prefix-compare lexicographically, so month
// bucketing uses key prefixes instead of getMonth()/getFullYear(), which
// shift by server timezone for midnight-UTC-parsed dates.
const BUSINESS_TIMEZONE = 'Asia/Manila';
const manilaDateString = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
const manilaMonthKey = (now = new Date()) => manilaDateString(now).slice(0, 7);
const shiftMonthKey = (yearMonth, offset) => {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const monthLabelForKey = (yearMonth) =>
  new Date(`${yearMonth}-01T00:00:00`).toLocaleString('en-US', { month: 'short' });

const buildDashboard = async () => {
  const [vendorList, slaughterRecords, invoices, feeConfig] = await Promise.all([
    store.listVendors(),
    store.listRecords(),
    store.listInvoices(),
    store.listFees()
  ]);
  const join = withVendor(vendorList);
  const today = manilaDateString();
  const monthStart = `${manilaMonthKey()}-01`;

  const totalVendors = vendorList.filter((v) => v.status === 'Active').length;
  const totalRecordsToday = slaughterRecords.filter((r) => r.date === today).length;
  const totalRecordsThisMonth = slaughterRecords.filter((r) => r.date >= monthStart).length;
  const totalRevenueThisMonth = invoices
    .filter((inv) => inv.date_issued >= monthStart)
    .reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
  const unpaidInvoicesCount = invoices.filter((inv) => inv.payment_status !== 'Paid').length;

  const recentSlaughterRecords = [...slaughterRecords].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10).map(join);
  const recentInvoices = [...invoices].sort((a, b) => new Date(b.date_issued) - new Date(a.date_issued)).slice(0, 10).map((invoice) => ({
    ...invoice,
    vendor_name: vendorList.find((v) => v.id === invoice.vendor_id)?.name || 'Unknown Vendor'
  }));

  const currentMonthKey = manilaMonthKey();
  const monthlySlaughterVolume = Array.from({ length: 6 }, (_, i) => {
    const key = shiftMonthKey(currentMonthKey, i - 5);
    const monthRecords = slaughterRecords.filter((r) => (r.date || '').slice(0, 7) === key);
    let cowTotal = 0;
    let pigTotal = 0;
    monthRecords.forEach((r) => {
      const heads = Number(r.number_of_heads || 0);
      const cowSplit = Number(r.number_of_heads_cow ?? NaN);
      const pigSplit = Number(r.number_of_heads_pig ?? NaN);
      if (r.animal_type === 'Cow') cowTotal += heads;
      else if (r.animal_type === 'Pig') pigTotal += heads;
      else if (r.animal_type === 'Both') {
        // Prefer explicit split when present, otherwise split evenly to avoid double-billing volume.
        if (Number.isFinite(cowSplit) && Number.isFinite(pigSplit)) {
          cowTotal += cowSplit;
          pigTotal += pigSplit;
        } else {
          cowTotal += Math.ceil(heads / 2);
          pigTotal += Math.floor(heads / 2);
        }
      }
    });
    return {
      month: monthLabelForKey(key),
      Cow: cowTotal,
      Pig: pigTotal
    };
  });

  const feeBreakdown = feeConfig.map((fee) => ({
    name: fee.label,
    value: invoices.reduce((sum, invoice) => {
      const key = fee.id;
      if (key === 'corral_casket_fee') return sum + Number(invoice.corral_fee || 0);
      if (key === 'delivery_fee') return sum + Number(invoice.delivery_fee || 0);
      if (key === 'anti_mortem_fee') return sum + Number(invoice.anti_mortem_fee || 0);
      return sum + Number(invoice.facility_fee || 0);
    }, 0)
  }));

  return {
    summary: {
      totalVendors,
      totalRecordsToday,
      totalRecordsThisMonth,
      totalRevenueThisMonth,
      unpaidInvoicesCount
    },
    recentSlaughterRecords,
    recentInvoices,
    monthlySlaughterVolume,
    feeBreakdown,
    municipality: MUNICIPALITY
  };
};

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res)).catch(next);
};

app.get('/api/dashboard', asyncHandler(async (req, res) => {
  res.json(await buildDashboard());
}));

app.get('/api/vendors', asyncHandler(async (req, res) => {
  const { list, error } = applyLimit(await store.listVendors(), req, res);
  if (error) return res.status(400).json({ message: error });
  res.json(list);
}));

app.post('/api/vendors', asyncHandler(async (req, res) => {
  const { name, address, contact_number, email, animal_type } = req.body;
  if (!name || !contact_number || !email) {
    return res.status(400).json({ message: 'Name, contact number, and email are required.' });
  }
  if (!EMAIL_RE.test(String(email))) {
    return res.status(400).json({ message: 'Email must be a valid email address.' });
  }
  if (animal_type !== undefined && !ANIMAL_TYPES.includes(animal_type)) {
    return res.status(400).json({ message: 'Invalid animal type.' });
  }

  const newVendor = {
    id: newId('VEN'),
    name,
    address: address || '',
    contact_number,
    email,
    animal_type: animal_type || 'Both',
    created_at: manilaDateString(),
    status: 'Active'
  };

  await store.saveVendor(newVendor);
  res.status(201).json(newVendor);
}));

app.patch('/api/vendors/:id', asyncHandler(async (req, res) => {
  const allowed = ['name', 'address', 'contact_number', 'email', 'animal_type', 'status'];
  const patch = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  });
  if (patch.email !== undefined && !EMAIL_RE.test(String(patch.email))) {
    return res.status(400).json({ message: 'Email must be a valid email address.' });
  }
  if (patch.animal_type !== undefined && !ANIMAL_TYPES.includes(patch.animal_type)) {
    return res.status(400).json({ message: 'Invalid animal type.' });
  }
  if (patch.status !== undefined && !['Active', 'Inactive'].includes(patch.status)) {
    return res.status(400).json({ message: 'Invalid vendor status.' });
  }
  if (patch.name !== undefined && !String(patch.name).trim()) {
    return res.status(400).json({ message: 'Vendor name cannot be empty.' });
  }
  if (patch.contact_number !== undefined && !String(patch.contact_number).trim()) {
    return res.status(400).json({ message: 'Contact number cannot be empty.' });
  }
  const vendor = await store.updateVendor(req.params.id, patch);
  if (!vendor) return res.status(404).json({ message: 'Vendor not found.' });
  res.json(vendor);
}));

app.delete('/api/vendors/:id', asyncHandler(async (req, res) => {
  const vendor = await store.updateVendor(req.params.id, { status: 'Inactive' });
  if (!vendor) return res.status(404).json({ message: 'Vendor not found.' });
  res.json(vendor);
}));

app.get('/api/slaughter-records', asyncHandler(async (req, res) => {
  const [vendorList, records] = await Promise.all([store.listVendors(), store.listRecords()]);
  const { list, error } = applyLimit(records.map(withVendor(vendorList)), req, res);
  if (error) return res.status(400).json({ message: error });
  res.json(list);
}));

app.post('/api/slaughter-records', asyncHandler(async (req, res) => {
  const record = req.body;
  if (!record.vendor_id || !record.date || !record.animal_type) {
    return res.status(400).json({ message: 'Vendor, date, and animal type are required.' });
  }

  const heads = Number(record.number_of_heads || 0);
  if (!Number.isFinite(heads) || heads <= 0) {
    return res.status(400).json({ message: 'Number of heads must be greater than zero.' });
  }
  if (!ANIMAL_TYPES.includes(record.animal_type)) {
    return res.status(400).json({ message: 'Invalid animal type.' });
  }
  if (!isValidDate(record.date)) {
    return res.status(400).json({ message: 'Date must be YYYY-MM-DD.' });
  }
  if (!(await store.getVendor(record.vendor_id))) {
    return res.status(400).json({ message: 'Vendor not found.' });
  }
  if (!isNonNegativeNumber(record.kilograms_cow) || !isNonNegativeNumber(record.kilograms_pig)) {
    return res.status(400).json({ message: 'Kilograms must be valid non-negative numbers.' });
  }
  if (record.status !== undefined && !RECORD_STATUSES.includes(record.status)) {
    return res.status(400).json({ message: 'Invalid record status.' });
  }

  const newRecord = {
    id: newId('SR'),
    vendor_id: record.vendor_id,
    date: record.date,
    animal_type: record.animal_type,
    number_of_heads: heads,
    number_of_heads_cow: record.number_of_heads_cow != null ? Number(record.number_of_heads_cow) : undefined,
    number_of_heads_pig: record.number_of_heads_pig != null ? Number(record.number_of_heads_pig) : undefined,
    meat_type_to_deliver: record.meat_type_to_deliver || 'Dressed',
    livestock_type: record.livestock_type || 'Native',
    kilograms_cow: record.kilograms_cow ?? null,
    kilograms_pig: record.kilograms_pig ?? null,
    status: record.status || 'Pending',
    created_at: new Date().toISOString()
  };

  await store.saveRecord(newRecord);
  const vendorList = await store.listVendors();
  res.status(201).json(withVendor(vendorList)(newRecord));
}));

app.patch('/api/slaughter-records/:id', asyncHandler(async (req, res) => {
  const allowed = ['vendor_id', 'date', 'animal_type', 'number_of_heads', 'number_of_heads_cow', 'number_of_heads_pig', 'meat_type_to_deliver', 'livestock_type', 'kilograms_cow', 'kilograms_pig', 'status'];
  const patch = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  });
  if (patch.number_of_heads !== undefined) patch.number_of_heads = Number(patch.number_of_heads || 0);
  if (patch.number_of_heads_cow != null) patch.number_of_heads_cow = Number(patch.number_of_heads_cow);
  if (patch.number_of_heads_pig != null) patch.number_of_heads_pig = Number(patch.number_of_heads_pig);

  if (patch.vendor_id !== undefined && !(await store.getVendor(patch.vendor_id))) {
    return res.status(400).json({ message: 'Vendor not found.' });
  }
  if (patch.date !== undefined && !isValidDate(patch.date)) {
    return res.status(400).json({ message: 'Date must be YYYY-MM-DD.' });
  }
  if (patch.animal_type !== undefined && !ANIMAL_TYPES.includes(patch.animal_type)) {
    return res.status(400).json({ message: 'Invalid animal type.' });
  }
  if (patch.number_of_heads !== undefined && (!Number.isFinite(patch.number_of_heads) || patch.number_of_heads <= 0)) {
    return res.status(400).json({ message: 'Number of heads must be greater than zero.' });
  }
  for (const key of ['number_of_heads_cow', 'number_of_heads_pig']) {
    if (patch[key] !== undefined && patch[key] !== null && (!Number.isFinite(patch[key]) || patch[key] < 0)) {
      return res.status(400).json({ message: 'Head splits must be valid non-negative numbers.' });
    }
  }
  if ((patch.kilograms_cow !== undefined && !isNonNegativeNumber(patch.kilograms_cow)) || (patch.kilograms_pig !== undefined && !isNonNegativeNumber(patch.kilograms_pig))) {
    return res.status(400).json({ message: 'Kilograms must be valid non-negative numbers.' });
  }
  if (patch.status !== undefined && !RECORD_STATUSES.includes(patch.status)) {
    return res.status(400).json({ message: 'Invalid record status.' });
  }

  const record = await store.updateRecord(req.params.id, patch);
  if (!record) return res.status(404).json({ message: 'Record not found.' });

  const vendorList = await store.listVendors();
  res.json(withVendor(vendorList)(record));
}));

app.delete('/api/slaughter-records/:id', asyncHandler(async (req, res) => {
  const deleted = await store.deleteRecord(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Record not found.' });
  res.json({ success: true });
}));

app.get('/api/invoices', asyncHandler(async (req, res) => {
  const [vendorList, invoices] = await Promise.all([store.listVendors(), store.listInvoices()]);
  const joined = invoices.map((invoice) => ({
    ...invoice,
    vendor_name: vendorList.find((v) => v.id === invoice.vendor_id)?.name || 'Unknown Vendor'
  }));
  const { list, error } = applyLimit(joined, req, res);
  if (error) return res.status(400).json({ message: error });
  res.json(list);
}));

app.get('/api/invoices/:id', asyncHandler(async (req, res) => {
  const [vendorList, invoice] = await Promise.all([store.listVendors(), store.getInvoice(req.params.id)]);
  if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
  res.json({
    ...invoice,
    municipality: MUNICIPALITY,
    vendor: vendorList.find((v) => v.id === invoice.vendor_id) || null
  });
}));

// Due-date policy (B14, same-day payment — must match UI/PDF text):
// - due_date ALWAYS equals date_issued. Any client-supplied due_date is
//   ignored on create and can never change via PATCH (immutable).
// - Status transitions are MANUAL only (PATCH payment_status). The server
//   never auto-marks Overdue; treasurer flips Unpaid -> Paid/Overdue.
// - Unpaid invoices raise 'warning' notifications, Overdue raise 'alert'.
// - Dashboard 'unpaid' count = all statuses except Paid.
app.post('/api/invoices', asyncHandler(async (req, res) => {
  const payload = req.body;
  if (!payload.vendor_id || !payload.date_issued) {
    return res.status(400).json({ message: 'Vendor and date issued are required.' });
  }

  const cowHeads = Number(payload.number_of_heads_cow || 0);
  const pigHeads = Number(payload.number_of_heads_pig || 0);
  if (cowHeads + pigHeads <= 0) {
    return res.status(400).json({ message: 'At least one head (cow or pig) is required.' });
  }
  if (!isValidDate(payload.date_issued)) {
    return res.status(400).json({ message: 'Date issued must be YYYY-MM-DD.' });
  }
  if (!(await store.getVendor(payload.vendor_id))) {
    return res.status(400).json({ message: 'Vendor not found.' });
  }
  if (payload.slaughter_record_id && !(await store.getRecord(payload.slaughter_record_id))) {
    return res.status(400).json({ message: 'Slaughter record not found.' });
  }
  if (payload.payment_status !== undefined && !PAYMENT_STATUSES.includes(payload.payment_status)) {
    return res.status(400).json({ message: 'Invalid payment status.' });
  }

  const breakdown = await computeFeeBreakdown(cowHeads, pigHeads);
  const newInvoice = {
    id: newId('INV'),
    vendor_id: payload.vendor_id,
    slaughter_record_id: payload.slaughter_record_id || null,
    date_issued: payload.date_issued,
    due_date: payload.date_issued,
    number_of_heads_cow: Number(payload.number_of_heads_cow || 0),
    number_of_heads_pig: Number(payload.number_of_heads_pig || 0),
    corral_fee: breakdown.corral_fee,
    delivery_fee: breakdown.delivery_fee,
    anti_mortem_fee: breakdown.anti_mortem_fee,
    facility_fee: breakdown.facility_fee,
    total_amount: breakdown.total_amount,
    payment_status: payload.payment_status || 'Unpaid',
    notes: payload.notes || ''
  };

  await store.saveInvoice(newInvoice);

  if (newInvoice.payment_status !== 'Paid') {
    await store.saveNotification({
      id: newId('NOT'),
      type: newInvoice.payment_status === 'Overdue' ? 'alert' : 'warning',
      message: `Invoice ${newInvoice.id} is still unpaid after the slaughter date.`,
      is_read: false,
      created_at: new Date().toISOString()
    });
  }

  return res.status(201).json(newInvoice);
}));

app.get('/api/notifications', asyncHandler(async (req, res) => {
  const { list, error } = applyLimit(await store.listNotifications(), req, res);
  if (error) return res.status(400).json({ message: error });
  res.json(list);
}));

app.patch('/api/notifications/:id/read', asyncHandler(async (req, res) => {
  const notification = await store.updateNotificationRead(req.params.id);
  if (!notification) return res.status(404).json({ message: 'Notification not found.' });
  res.json(notification);
}));

app.patch('/api/notifications/mark-all-read', asyncHandler(async (req, res) => {
  await store.markAllNotificationsRead();
  res.json({ success: true });
}));

app.get('/api/service-fees', asyncHandler(async (req, res) => {
  const feeConfig = await store.listFees();
  res.json({ municipality: MUNICIPALITY, fee_config: feeConfig, total_per_head: await totalPerHead() });
}));

const parseFeeInput = (value, fallback) => {
  if (value === '' || value === null || value === undefined) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
};

app.post('/api/service-fees', asyncHandler(async (req, res) => {
  const { corralFee, deliveryFee, antiMortemFee, facilityFee } = req.body;
  // Omitted fields keep their CURRENT stored values (B13), not hardcoded
  // defaults — otherwise a partial update silently resets other fees.
  const current = await store.listFees();
  const currentAmount = (id, fallback) => {
    const entry = current.find((f) => f.id === id);
    const val = entry ? Number(entry.amount) : fallback;
    return Number.isFinite(val) && val >= 0 ? val : fallback;
  };
  const parsed = [
    { id: 'corral_casket_fee', label: 'Corral/Casket Fee', value: parseFeeInput(corralFee, currentAmount('corral_casket_fee', 15)) },
    { id: 'delivery_fee', label: 'Delivery Fee', value: parseFeeInput(deliveryFee, currentAmount('delivery_fee', 25)) },
    { id: 'anti_mortem_fee', label: 'Anti/Post Mortem Fee', value: parseFeeInput(antiMortemFee, currentAmount('anti_mortem_fee', 10)) },
    { id: 'facility_fee', label: 'Facility Fee', value: parseFeeInput(facilityFee, currentAmount('facility_fee', 45)) }
  ];

  const invalid = parsed.find((p) => p.value === null);
  if (invalid) {
    return res.status(400).json({ message: 'Fees must be valid non-negative numbers.' });
  }

  const updated = parsed.map((p) => ({ id: p.id, label: p.label, amount: p.value }));

  await store.saveFees(updated);
  res.json({ fee_config: updated, total_per_head: updated.reduce((sum, item) => sum + Number(item.amount), 0) });
}));

app.patch('/api/invoices/:id', asyncHandler(async (req, res) => {
  const allowedStatus = PAYMENT_STATUSES;
  if (req.body.payment_status && !allowedStatus.includes(req.body.payment_status)) {
    return res.status(400).json({ message: 'Invalid payment status.' });
  }

  const patch = {};
  if (req.body.payment_status) patch.payment_status = req.body.payment_status;
  if (req.body.notes !== undefined) patch.notes = String(req.body.notes || '');

  // Recompute fees if headcounts change
  if (req.body.number_of_heads_cow !== undefined || req.body.number_of_heads_pig !== undefined) {
    const current = await store.getInvoice(req.params.id);
    if (!current) return res.status(404).json({ message: 'Invoice not found.' });
    const cow = req.body.number_of_heads_cow !== undefined ? Number(req.body.number_of_heads_cow) : current.number_of_heads_cow;
    const pig = req.body.number_of_heads_pig !== undefined ? Number(req.body.number_of_heads_pig) : current.number_of_heads_pig;
    if (!Number.isFinite(cow) || !Number.isFinite(pig) || cow < 0 || pig < 0 || cow + pig <= 0) return res.status(400).json({ message: 'Headcounts must be valid non-negative numbers with at least one head.' });
    const breakdown = await computeFeeBreakdown(cow, pig);
    patch.number_of_heads_cow = cow;
    patch.number_of_heads_pig = pig;
    patch.corral_fee = breakdown.corral_fee;
    patch.delivery_fee = breakdown.delivery_fee;
    patch.anti_mortem_fee = breakdown.anti_mortem_fee;
    patch.facility_fee = breakdown.facility_fee;
    patch.total_amount = breakdown.total_amount;
  }

  const invoice = await store.updateInvoice(req.params.id, patch);
  if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });

  const vendorList = await store.listVendors();
  res.json({
    ...invoice,
    vendor_name: vendorList.find((v) => v.id === invoice.vendor_id)?.name || 'Unknown Vendor'
  });
}));

app.delete('/api/invoices/:id', asyncHandler(async (req, res) => {
  const deleted = await store.deleteInvoice(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Invoice not found.' });
  res.json({ success: true });
}));

app.delete('/api/notifications/:id', asyncHandler(async (req, res) => {
  const deleted = await store.deleteNotification(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Notification not found.' });
  res.json({ success: true });
}));

// Health check (B15): load balancers / uptime monitors / mobile clients.
app.get('/api/health', (req, res) => {
  res.json({ ok: true, store: useFirestore ? 'firestore' : 'memory', time: new Date().toISOString() });
});

// JSON 404s (B15): unknown API routes return { message }, not Express HTML,
// so web/mobile clients can parse errors uniformly via parseError().
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'API route not found.' });
});

// Centralized error handler (must be registered after all routes).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[api] Unhandled error:', err?.message || err);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: 'Internal server error.' });
});

const start = async () => {
  useFirestore = await initFirestore();
  console.log(
    useFirestore
      ? 'Municipal slaughterhouse API is running on http://localhost:' + PORT + ' [Firestore: ' + (process.env.FIREBASE_PROJECT_ID || 'application-default') + ']'
      : 'Municipal slaughterhouse API is running on http://localhost:' + PORT + ' [in-memory store; set FIREBASE_* env vars for Firestore]'
  );
  app.listen(PORT);
};

// Firestore single-doc helper needs updateNotificationRead; defined here to
// keep all Firestore access inside `store`.
store.updateNotificationRead = async (id) => {
  if (useFirestore) {
    const ref = firestoreDb.collection(COLLECTIONS.notifications).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return null;
    await ref.update({ is_read: true });
    return { id, ...snap.data(), is_read: true };
  }
  const notification = memory.notifications.find((item) => item.id === id);
  if (!notification) return null;
  notification.is_read = true;
  return notification;
};

start();
