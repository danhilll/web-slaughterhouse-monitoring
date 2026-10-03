// One-time Firestore seed migration (B6).
// Usage:
//   node scripts/seed-firestore.js --dry-run   (default; no credentials needed)
//   node scripts/seed-firestore.js --live       (writes seeds; needs FIREBASE_* env)
//   node scripts/seed-firestore.js --live --overwrite
//
// Seeds mirror server/index.js seed data with STABLE IDs (VEN-1001, SR-2001,
// INV-3001, NOT-4001) per the B3 data model. Never uses Date.now() IDs.

const DRY_RUN = !process.argv.includes('--live');
const OVERWRITE = process.argv.includes('--overwrite');

const seeds = {
  vendors: [
    { id: 'VEN-1001', name: 'Nayon Meat Trading', address: 'Bacolod Street, Poblacion', contact_number: '0917-123-4455', email: 'nayonmeat@gmail.com', animal_type: 'Both', created_at: '2026-08-01', status: 'Active' },
    { id: 'VEN-1002', name: 'Mabini Livestock Supply', address: 'Rizal Avenue, Barangay 1', contact_number: '0922-441-9980', email: 'mabini.livestock@yahoo.com', animal_type: 'Cow', created_at: '2026-08-10', status: 'Active' },
    { id: 'VEN-1003', name: 'Kusina ng Hapag', address: 'San Vicente Road', contact_number: '0933-642-2210', email: 'kusinanghapag@gmail.com', animal_type: 'Pig', created_at: '2026-08-18', status: 'Inactive' }
  ],
  slaughter_records: [
    { id: 'SR-2001', vendor_id: 'VEN-1001', date: '2026-09-03', animal_type: 'Cow', number_of_heads: 12, meat_type_to_deliver: 'Dressed', livestock_type: 'Native', kilograms_cow: 220, kilograms_pig: null, status: 'Completed', created_at: '2026-09-03T08:10:00.000Z' },
    { id: 'SR-2002', vendor_id: 'VEN-1002', date: '2026-09-02', animal_type: 'Pig', number_of_heads: 7, meat_type_to_deliver: 'Cuts', livestock_type: 'Local Bred', kilograms_cow: null, kilograms_pig: 138, status: 'Pending', created_at: '2026-09-02T12:40:00.000Z' },
    { id: 'SR-2003', vendor_id: 'VEN-1001', date: '2026-09-01', animal_type: 'Both', number_of_heads: 18, number_of_heads_cow: 10, number_of_heads_pig: 8, meat_type_to_deliver: 'Whole', livestock_type: 'Imported', kilograms_cow: 300, kilograms_pig: 220, status: 'Completed', created_at: '2026-09-01T09:15:00.000Z' },
    { id: 'SR-2004', vendor_id: 'VEN-1003', date: '2026-08-28', animal_type: 'Pig', number_of_heads: 9, meat_type_to_deliver: 'Dressed', livestock_type: 'Local Bred', kilograms_cow: null, kilograms_pig: 170, status: 'Cancelled', created_at: '2026-08-28T07:10:00.000Z' }
  ],
  invoices: [
    { id: 'INV-3001', vendor_id: 'VEN-1001', slaughter_record_id: 'SR-2001', date_issued: '2026-09-03', due_date: '2026-09-03', number_of_heads_cow: 12, number_of_heads_pig: 0, corral_fee: 180, delivery_fee: 300, anti_mortem_fee: 120, facility_fee: 540, total_amount: 1140, payment_status: 'Unpaid', notes: 'Service fee due today.' },
    { id: 'INV-3002', vendor_id: 'VEN-1002', slaughter_record_id: 'SR-2002', date_issued: '2026-09-02', due_date: '2026-09-02', number_of_heads_cow: 0, number_of_heads_pig: 7, corral_fee: 105, delivery_fee: 175, anti_mortem_fee: 70, facility_fee: 315, total_amount: 665, payment_status: 'Paid', notes: 'Payment settled in full.' },
    { id: 'INV-3003', vendor_id: 'VEN-1001', slaughter_record_id: 'SR-2003', date_issued: '2026-09-01', due_date: '2026-09-01', number_of_heads_cow: 10, number_of_heads_pig: 8, corral_fee: 270, delivery_fee: 450, anti_mortem_fee: 180, facility_fee: 810, total_amount: 1710, payment_status: 'Overdue', notes: 'Past due; no payment received.' }
  ],
  notifications: [
    { id: 'NOT-4001', type: 'warning', message: 'Invoice INV-3001 is still unpaid after the slaughter date.', is_read: false, created_at: '2026-09-03T08:45:00.000Z' },
    { id: 'NOT-4002', type: 'alert', message: 'Invoice INV-3003 is overdue and requires collection before close of day.', is_read: false, created_at: '2026-09-01T13:15:00.000Z' },
    { id: 'NOT-4003', type: 'info', message: 'New slaughter record SR-2003 was added and is ready for billing review.', is_read: true, created_at: '2026-09-01T09:15:00.000Z' }
  ],
  serviceFees: [
    { id: 'corral_casket_fee', label: 'Corral/Casket Fee', amount: 15 },
    { id: 'delivery_fee', label: 'Delivery Fee', amount: 25 },
    { id: 'anti_mortem_fee', label: 'Anti/Post Mortem Fee', amount: 10 },
    { id: 'facility_fee', label: 'Facility Fee', amount: 45 }
  ]
};

// Note: SR-2003 carries an explicit 10/8 cow/pig split (B3 model). The legacy
// in-memory seed only stored total 18; the migration backfills the split to
// match INV-3003 so volume charts and billing agree (see B17).

const errors = [];
const assert = (cond, msg) => { if (!cond) errors.push(msg); };
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

const vendorIds = new Set(seeds.vendors.map((v) => v.id));
seeds.vendors.forEach((v) => {
  assert(v.id && v.name && v.contact_number && v.email, `vendor ${v.id}: missing required field`);
  assert(['Cow', 'Pig', 'Both'].includes(v.animal_type), `vendor ${v.id}: bad animal_type`);
  assert(['Active', 'Inactive'].includes(v.status), `vendor ${v.id}: bad status`);
  assert(isDate(v.created_at), `vendor ${v.id}: bad created_at`);
});
const recordIds = new Set(seeds.slaughter_records.map((r) => r.id));
seeds.slaughter_records.forEach((r) => {
  assert(vendorIds.has(r.vendor_id), `record ${r.id}: unknown vendor ${r.vendor_id}`);
  assert(isDate(r.date), `record ${r.id}: bad date`);
  assert(['Cow', 'Pig', 'Both'].includes(r.animal_type), `record ${r.id}: bad animal_type`);
  assert(Number.isFinite(Number(r.number_of_heads)) && Number(r.number_of_heads) > 0, `record ${r.id}: bad number_of_heads`);
  if (r.animal_type === 'Both') {
    assert(Number.isFinite(Number(r.number_of_heads_cow)) && Number.isFinite(Number(r.number_of_heads_pig)), `record ${r.id}: Both requires cow/pig split`);
    assert(Number(r.number_of_heads_cow) + Number(r.number_of_heads_pig) === Number(r.number_of_heads), `record ${r.id}: split must sum to total`);
  }
  assert(['Pending', 'Completed', 'Cancelled'].includes(r.status), `record ${r.id}: bad status`);
});
seeds.invoices.forEach((inv) => {
  assert(vendorIds.has(inv.vendor_id), `invoice ${inv.id}: unknown vendor ${inv.vendor_id}`);
  assert(!inv.slaughter_record_id || recordIds.has(inv.slaughter_record_id), `invoice ${inv.id}: unknown record ${inv.slaughter_record_id}`);
  assert(isDate(inv.date_issued) && isDate(inv.due_date), `invoice ${inv.id}: bad dates`);
  assert(Number(inv.number_of_heads_cow || 0) + Number(inv.number_of_heads_pig || 0) > 0, `invoice ${inv.id}: heads sum must be > 0`);
  const expect = (Number(inv.number_of_heads_cow) + Number(inv.number_of_heads_pig)) * (15 + 25 + 10 + 45);
  assert(Number(inv.total_amount) === expect, `invoice ${inv.id}: total ${inv.total_amount} != heads*95 (${expect})`);
  assert(['Paid', 'Unpaid', 'Overdue'].includes(inv.payment_status), `invoice ${inv.id}: bad payment_status`);
});
seeds.notifications.forEach((n) => {
  assert(['info', 'warning', 'alert'].includes(n.type), `notification ${n.id}: bad type`);
  assert(typeof n.is_read === 'boolean', `notification ${n.id}: is_read must be boolean`);
});
assert(seeds.serviceFees.length === 4, 'serviceFees: expected 4 entries');
assert(
  seeds.serviceFees.map((f) => f.id).join(',') === 'corral_casket_fee,delivery_fee,anti_mortem_fee,facility_fee',
  'serviceFees: ids/order must match B3 model'
);

if (errors.length > 0) {
  console.error('Seed validation FAILED:');
  errors.forEach((e) => console.error(' - ' + e));
  process.exit(1);
}

const plan = [
  ...seeds.vendors.map((d) => ['vendors', d.id]),
  ...seeds.slaughter_records.map((d) => ['slaughter_records', d.id]),
  ...seeds.invoices.map((d) => ['invoices', d.id]),
  ...seeds.notifications.map((d) => ['notifications', d.id]),
  ['config/serviceFees', '(doc)']
];

console.log(`Seed validation OK: ${seeds.vendors.length} vendors, ${seeds.slaughter_records.length} records, ${seeds.invoices.length} invoices, ${seeds.notifications.length} notifications, 4 fees.`);

if (DRY_RUN) {
  console.log(`DRY-RUN: would write ${plan.length} docs (use --live to write${OVERWRITE ? '' : ', existing docs skipped unless --overwrite'}).`);
  plan.forEach(([c, id]) => console.log(`  ${c}/${id}`));
  process.exit(0);
}

const hasCreds =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
if (!hasCreds) {
  console.error('LIVE mode needs FIREBASE_* env vars or GOOGLE_APPLICATION_CREDENTIALS. Aborting (nothing written).');
  process.exit(1);
}

const admin = (await import('firebase-admin')).default;
if (admin.apps.length === 0) {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
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
const db = admin.firestore();
let written = 0;
let skipped = 0;

const putDoc = async (collection, doc) => {
  const ref = db.collection(collection).doc(doc.id);
  const snap = await ref.get();
  if (snap.exists && !OVERWRITE) { skipped += 1; console.log(`  skip ${collection}/${doc.id} (exists)`); return; }
  const { id, ...data } = doc;
  await ref.set(data, { merge: false });
  written += 1;
  console.log(`  wrote ${collection}/${doc.id}`);
};

for (const doc of seeds.vendors) await putDoc('vendors', doc);
for (const doc of seeds.slaughter_records) await putDoc('slaughter_records', doc);
for (const doc of seeds.invoices) await putDoc('invoices', doc);
for (const doc of seeds.notifications) await putDoc('notifications', doc);

const feesRef = db.doc('config/serviceFees');
const feesSnap = await feesRef.get();
if (!feesSnap.exists || OVERWRITE) {
  await feesRef.set({ fees: seeds.serviceFees, updated_at: new Date().toISOString() }, { merge: false });
  written += 1;
  console.log('  wrote config/serviceFees');
} else {
  skipped += 1;
  console.log('  skip config/serviceFees (exists)');
}

console.log(`Done. written=${written} skipped=${skipped}`);
