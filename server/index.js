import express from 'express';
import cors from 'cors';

const app = express();
const requestedPort = Number(process.argv[2] || process.env.PORT || 5000);
const PORT = Number.isFinite(requestedPort) ? requestedPort : 5000;
const MUNICIPALITY = 'San Fernando';

app.use(cors());
app.use(express.json());

const feeConfig = [
  { id: 'corral_casket_fee', label: 'Corral/Casket Fee', amount: 15 },
  { id: 'delivery_fee', label: 'Delivery Fee', amount: 25 },
  { id: 'anti_mortem_fee', label: 'Anti/Post Mortem Fee', amount: 10 },
  { id: 'facility_fee', label: 'Facility Fee', amount: 45 }
];

const vendors = [
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

const slaughterRecords = [
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

const invoices = [
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

const notifications = [
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

const getFeeAmounts = () => {
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

const totalPerHead = () => {
  const f = getFeeAmounts();
  return f.corral + f.delivery + f.antiMortem + f.facility;
};

const computeFeeBreakdown = (cowHeads = 0, pigHeads = 0) => {
  const fees = getFeeAmounts();
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

const buildDashboard = () => {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const totalVendors = vendors.filter((v) => v.status === 'Active').length;
  const totalRecordsToday = slaughterRecords.filter((r) => r.date === today).length;
  const totalRecordsThisMonth = slaughterRecords.filter((r) => r.date >= monthStart).length;
  const totalRevenueThisMonth = invoices
    .filter((inv) => inv.date_issued >= monthStart)
    .reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
  const unpaidInvoicesCount = invoices.filter((inv) => inv.payment_status !== 'Paid').length;

  const recentSlaughterRecords = [...slaughterRecords].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10).map(withVendor);
  const recentInvoices = [...invoices].sort((a, b) => new Date(b.date_issued) - new Date(a.date_issued)).slice(0, 10).map((invoice) => ({
    ...invoice,
    vendor_name: vendors.find((v) => v.id === invoice.vendor_id)?.name || 'Unknown Vendor'
  }));

  const monthlySlaughterVolume = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - 5 + i, 1);
    const monthLabel = d.toLocaleString('en-US', { month: 'short' });
    const monthRecords = slaughterRecords.filter((r) => {
      const recordDate = new Date(r.date);
      return recordDate.getMonth() === d.getMonth() && recordDate.getFullYear() === d.getFullYear();
    });
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
      month: monthLabel,
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

const withVendor = (entity) => {
  const vendor = vendors.find((item) => item.id === entity.vendor_id);
  return {
    ...entity,
    vendor_name: vendor ? vendor.name : 'Unknown Vendor'
  };
};

app.get('/api/dashboard', (req, res) => {
  res.json(buildDashboard());
});

app.get('/api/vendors', (req, res) => {
  res.json(vendors);
});

app.post('/api/vendors', (req, res) => {
  const { name, address, contact_number, email, animal_type } = req.body;
  if (!name || !contact_number || !email) {
    return res.status(400).json({ message: 'Name, contact number, and email are required.' });
  }

  const newVendor = {
    id: `VEN-${Date.now()}`,
    name,
    address: address || '',
    contact_number,
    email,
    animal_type: animal_type || 'Both',
    created_at: new Date().toISOString().slice(0, 10),
    status: 'Active'
  };

  vendors.push(newVendor);
  res.status(201).json(newVendor);
});

app.patch('/api/vendors/:id', (req, res) => {
  const vendor = vendors.find((item) => item.id === req.params.id);
  if (!vendor) return res.status(404).json({ message: 'Vendor not found.' });

  const allowed = ['name', 'address', 'contact_number', 'email', 'animal_type', 'status'];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) vendor[key] = req.body[key];
  });
  res.json(vendor);
});

app.delete('/api/vendors/:id', (req, res) => {
  const index = vendors.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: 'Vendor not found.' });

  vendors[index].status = 'Inactive';
  res.json(vendors[index]);
});

app.get('/api/slaughter-records', (req, res) => {
  res.json(slaughterRecords.map(withVendor));
});

app.post('/api/slaughter-records', (req, res) => {
  const record = req.body;
  if (!record.vendor_id || !record.date || !record.animal_type) {
    return res.status(400).json({ message: 'Vendor, date, and animal type are required.' });
  }

  const heads = Number(record.number_of_heads || 0);
  if (!Number.isFinite(heads) || heads <= 0) {
    return res.status(400).json({ message: 'Number of heads must be greater than zero.' });
  }

  const newRecord = {
    id: `SR-${Date.now()}`,
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

  slaughterRecords.unshift(newRecord);
  res.status(201).json(withVendor(newRecord));
});

app.patch('/api/slaughter-records/:id', (req, res) => {
  const record = slaughterRecords.find((item) => item.id === req.params.id);
  if (!record) return res.status(404).json({ message: 'Record not found.' });

  const allowed = ['vendor_id', 'date', 'animal_type', 'number_of_heads', 'number_of_heads_cow', 'number_of_heads_pig', 'meat_type_to_deliver', 'livestock_type', 'kilograms_cow', 'kilograms_pig', 'status'];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) record[key] = req.body[key];
  });
  record.number_of_heads = Number(record.number_of_heads || 0);
  if (record.number_of_heads_cow != null) record.number_of_heads_cow = Number(record.number_of_heads_cow);
  if (record.number_of_heads_pig != null) record.number_of_heads_pig = Number(record.number_of_heads_pig);

  res.json(withVendor(record));
});

app.delete('/api/slaughter-records/:id', (req, res) => {
  const index = slaughterRecords.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: 'Record not found.' });

  slaughterRecords.splice(index, 1);
  res.json({ success: true });
});

app.get('/api/invoices', (req, res) => {
  res.json(invoices.map((invoice) => ({
    ...invoice,
    vendor_name: vendors.find((v) => v.id === invoice.vendor_id)?.name || 'Unknown Vendor'
  })));
});

app.get('/api/invoices/:id', (req, res) => {
  const invoice = invoices.find((item) => item.id === req.params.id);
  if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
  res.json({
    ...invoice,
    municipality: MUNICIPALITY,
    vendor: vendors.find((v) => v.id === invoice.vendor_id) || null
  });
});

app.post('/api/invoices', (req, res) => {
  const payload = req.body;
  if (!payload.vendor_id || !payload.date_issued) {
    return res.status(400).json({ message: 'Vendor and date issued are required.' });
  }

  const cowHeads = Number(payload.number_of_heads_cow || 0);
  const pigHeads = Number(payload.number_of_heads_pig || 0);
  if (cowHeads + pigHeads <= 0) {
    return res.status(400).json({ message: 'At least one head (cow or pig) is required.' });
  }

  const breakdown = computeFeeBreakdown(cowHeads, pigHeads);
  const newInvoice = {
    id: `INV-${Date.now()}`,
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

  invoices.unshift(newInvoice);

  if (newInvoice.payment_status !== 'Paid') {
    notifications.unshift({
      id: `NOT-${Date.now()}`,
      type: newInvoice.payment_status === 'Overdue' ? 'alert' : 'warning',
      message: `Invoice ${newInvoice.id} is still unpaid after the slaughter date.`,
      is_read: false,
      created_at: new Date().toISOString()
    });
  }

  return res.status(201).json(newInvoice);
});

app.get('/api/notifications', (req, res) => {
  res.json(notifications);
});

app.patch('/api/notifications/:id/read', (req, res) => {
  const notification = notifications.find((item) => item.id === req.params.id);
  if (!notification) return res.status(404).json({ message: 'Notification not found.' });

  notification.is_read = true;
  res.json(notification);
});

app.patch('/api/notifications/mark-all-read', (req, res) => {
  notifications.forEach((item) => {
    item.is_read = true;
  });
  res.json({ success: true });
});

app.get('/api/service-fees', (req, res) => {
  res.json({ municipality: MUNICIPALITY, fee_config: feeConfig, total_per_head: totalPerHead() });
});

const parseFeeInput = (value, fallback) => {
  if (value === '' || value === null || value === undefined) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
};

app.post('/api/service-fees', (req, res) => {
  const { corralFee, deliveryFee, antiMortemFee, facilityFee } = req.body;
  const parsed = [
    { id: 'corral_casket_fee', label: 'Corral/Casket Fee', value: parseFeeInput(corralFee, 15) },
    { id: 'delivery_fee', label: 'Delivery Fee', value: parseFeeInput(deliveryFee, 25) },
    { id: 'anti_mortem_fee', label: 'Anti/Post Mortem Fee', value: parseFeeInput(antiMortemFee, 10) },
    { id: 'facility_fee', label: 'Facility Fee', value: parseFeeInput(facilityFee, 45) }
  ];

  const invalid = parsed.find((p) => p.value === null);
  if (invalid) {
    return res.status(400).json({ message: 'Fees must be valid non-negative numbers.' });
  }

  const updated = parsed.map((p) => ({ id: p.id, label: p.label, amount: p.value }));

  feeConfig.splice(0, feeConfig.length, ...updated);
  res.json({ fee_config: feeConfig, total_per_head: updated.reduce((sum, item) => sum + Number(item.amount), 0) });
});

app.patch('/api/invoices/:id', (req, res) => {
  const invoice = invoices.find((item) => item.id === req.params.id);
  if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });

  const allowedStatus = ['Paid', 'Unpaid', 'Overdue'];
  if (req.body.payment_status && !allowedStatus.includes(req.body.payment_status)) {
    return res.status(400).json({ message: 'Invalid payment status.' });
  }

  if (req.body.payment_status) invoice.payment_status = req.body.payment_status;
  if (req.body.notes !== undefined) invoice.notes = String(req.body.notes || '');

  // Recompute fees if headcounts change
  if (req.body.number_of_heads_cow !== undefined || req.body.number_of_heads_pig !== undefined) {
    const cow = req.body.number_of_heads_cow !== undefined ? Number(req.body.number_of_heads_cow) : invoice.number_of_heads_cow;
    const pig = req.body.number_of_heads_pig !== undefined ? Number(req.body.number_of_heads_pig) : invoice.number_of_heads_pig;
    if (cow + pig <= 0) return res.status(400).json({ message: 'At least one head is required.' });
    const breakdown = computeFeeBreakdown(cow, pig);
    invoice.number_of_heads_cow = cow;
    invoice.number_of_heads_pig = pig;
    invoice.corral_fee = breakdown.corral_fee;
    invoice.delivery_fee = breakdown.delivery_fee;
    invoice.anti_mortem_fee = breakdown.anti_mortem_fee;
    invoice.facility_fee = breakdown.facility_fee;
    invoice.total_amount = breakdown.total_amount;
  }

  res.json({
    ...invoice,
    vendor_name: vendors.find((v) => v.id === invoice.vendor_id)?.name || 'Unknown Vendor'
  });
});

app.delete('/api/invoices/:id', (req, res) => {
  const index = invoices.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: 'Invoice not found.' });
  invoices.splice(index, 1);
  res.json({ success: true });
});

app.delete('/api/notifications/:id', (req, res) => {
  const index = notifications.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: 'Notification not found.' });
  notifications.splice(index, 1);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Municipal slaughterhouse API is running on http://localhost:${PORT}`);
});
