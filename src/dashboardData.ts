import {manilaDay, periodBounds, validDay, metric, type Period, type MetricRow} from './monitoringMetrics.ts';
import {paymentState} from './overdue.ts';
// Pure aggregation for the read-only Dashboard. Days are Asia/Manila calendar days.
// A record with an unreadable date or amount is never counted as zero: it is excluded and counted.
export type AnimalRow = MetricRow & {species?: string; vendorBusinessId?: string};
export type InvoiceRow = MetricRow & {due_date?: string; vendor_name?: string; vendor_id?: string; corral_fee?: number; delivery_fee?: number; anti_mortem_fee?: number; facility_fee?: number; number_of_heads_cow?: number; number_of_heads_pig?: number; delivery?: {status?: string; deliveredAt?: string}};
export type Bucket = {key: string; label: string; start: string; end: string; future: boolean};

const addDays = (day: string, n: number) => { const d = new Date(day+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000);
const shortDay = (day: string) => new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(day+'T00:00:00Z'));
const shortMonth = (day: string) => new Intl.DateTimeFormat('en-PH',{month:'short',timeZone:'UTC'}).format(new Date(day+'T00:00:00Z'));

/** Chart range: Today shows the last 14 days for context; other periods show the whole period. */
export function chartBuckets(period: Period, now = new Date()): Bucket[] {
  const today = manilaDay(now)!;
  if (period === 'year') {
    const [start] = periodBounds('year', now);
    return Array.from({length:12}, (_,i) => { const s = new Date(start+'T00:00:00Z'); s.setUTCMonth(i); const e = new Date(s); e.setUTCMonth(i+1); const key = s.toISOString().slice(0,10); return {key, label: shortMonth(key), start: key, end: e.toISOString().slice(0,10), future: key > today}; });
  }
  const [start, end] = period === 'day' ? [addDays(today,-13), addDays(today,1)] : periodBounds(period, now);
  return Array.from({length: daysBetween(start,end)}, (_,i) => { const day = addDays(start,i); return {key: day, label: shortDay(day), start: day, end: addDays(day,1), future: day > today}; });
}

/** The same elapsed span of the previous period, so a partial period is compared fairly. */
export function previousSpan(period: Period, now = new Date()): [string,string] {
  const today = manilaDay(now)!;
  const [start] = periodBounds(period, now);
  const elapsed = daysBetween(start, today) + 1;
  const prevStart = period === 'day' ? addDays(start,-1) : period === 'week' ? addDays(start,-7) : (() => { const d = new Date(start+'T00:00:00Z'); if (period === 'month') d.setUTCMonth(d.getUTCMonth()-1); else d.setUTCFullYear(d.getUTCFullYear()-1); return d.toISOString().slice(0,10); })();
  const cap = start;
  const prevEnd = addDays(prevStart, elapsed);
  return [prevStart, prevEnd < cap ? prevEnd : cap];
}

export type Kpi = {current: number | null; previous: number | null};
export function kpis(animals: MetricRow[] | null, invoices: MetricRow[] | null, period: Period, now = new Date()) {
  const cur = periodBounds(period, now), prev = previousSpan(period, now);
  const pick = (rows: MetricRow[] | null, kind: Parameters<typeof metric>[1]): Kpi => rows ? {current: metric(rows, kind, cur), previous: metric(rows, kind, prev)} : {current: null, previous: null};
  return {animals: pick(animals,'animals'), invoices: pick(invoices,'invoices'), billed: pick(invoices,'billed'), paid: pick(invoices,'paid'), delivered: pick(invoices,'delivered')};
}

/** Signed change in percent, or null when there is nothing honest to compare against. */
export function change(k: Kpi): number | null {
  if (k.current === null || k.previous === null || k.previous === 0) return null;
  return Math.round((k.current - k.previous) / k.previous * 100);
}

const cents = (pesos: unknown) => typeof pesos === 'number' && Number.isFinite(pesos) && pesos >= 0 ? Math.round(pesos*100) : null;
const inside = (day: string | null, b: {start: string; end: string}) => day !== null && day >= b.start && day < b.end;

export function animalSeries(rows: AnimalRow[], buckets: Bucket[]) {
  let excluded = 0;
  const data = buckets.map(b => ({key: b.key, label: b.label, future: b.future, Pig: b.future ? null as number | null : 0, Cow: b.future ? null as number | null : 0}));
  for (const row of rows) {
    const day = manilaDay(row.createdAt || '');
    if (!day || (row.species !== 'Pig' && row.species !== 'Cow')) { excluded++; continue; }
    const i = buckets.findIndex(b => inside(day, b));
    if (i >= 0 && data[i][row.species] !== null) data[i][row.species]! += 1;
  }
  return {data, excluded};
}

/** Running totals of billed (by issue date) and collected (by payment time), in centavos. */
export function moneySeries(rows: InvoiceRow[], buckets: Bucket[]) {
  let excluded = 0;
  const billed = buckets.map(() => 0), collected = buckets.map(() => 0);
  for (const row of rows) {
    const issued = validDay(row.date_issued) ? row.date_issued : null, amount = cents(row.total_amount);
    if (!issued || amount === null) { excluded++; continue; }
    const i = buckets.findIndex(b => inside(issued, b)); if (i >= 0) billed[i] += amount;
    if (row.payment_status === 'Paid' || row.payment) {
      const paidDay = manilaDay(row.payment?.recordedAt || ''), paid = row.payment?.amountCents;
      if (!paidDay || !Number.isSafeInteger(paid) || paid! < 0) { excluded++; continue; }
      const j = buckets.findIndex(b => inside(paidDay, b)); if (j >= 0) collected[j] += paid!;
    }
  }
  let b = 0, c = 0;
  const data = buckets.map((bucket, i) => { b += billed[i]; c += collected[i]; return {key: bucket.key, label: bucket.label, Billed: bucket.future ? null : b/100, Collected: bucket.future ? null : c/100}; });
  return {data, excluded};
}

export const FEE_PARTS = [['Corral','corral_fee'],['Delivery','delivery_fee'],['Inspection','anti_mortem_fee'],['Facility','facility_fee']] as const;
export function feeBreakdown(rows: InvoiceRow[], bounds: [string,string]) {
  let excluded = 0; const totals = FEE_PARTS.map(() => 0);
  for (const row of rows) {
    if (!validDay(row.date_issued)) { excluded++; continue; }
    if (row.date_issued < bounds[0] || row.date_issued >= bounds[1]) continue;
    const parts = FEE_PARTS.map(([,key]) => cents(row[key]));
    if (parts.some(p => p === null)) { excluded++; continue; }
    parts.forEach((p,i) => totals[i] += p!);
  }
  const sum = totals.reduce((a,b) => a+b, 0);
  return {parts: FEE_PARTS.map(([label],i) => ({label, amount: totals[i]/100, share: sum ? totals[i]/sum : 0})), total: sum/100, excluded};
}

export function topVendors(rows: InvoiceRow[], bounds: [string,string], limit = 5) {
  let excluded = 0; const byVendor = new Map<string,{name: string; amount: number; invoices: number}>();
  for (const row of rows) {
    const amount = cents(row.total_amount);
    if (!validDay(row.date_issued) || amount === null) { excluded++; continue; }
    if (row.date_issued < bounds[0] || row.date_issued >= bounds[1]) continue;
    const id = row.vendor_id || row.vendor_name || 'unknown', name = (row.vendor_name || '').trim() || 'Unknown vendor';
    const v = byVendor.get(id) ?? {name, amount: 0, invoices: 0}; v.amount += amount; v.invoices += 1; byVendor.set(id, v);
  }
  const sorted = [...byVendor.values()].sort((a,b) => b.amount - a.amount || a.name.localeCompare(b.name));
  const top = sorted.slice(0, limit), rest = sorted.slice(limit);
  const rowsOut = top.map(v => ({...v, amount: v.amount/100}));
  if (rest.length) rowsOut.push({name: `Other (${rest.length})`, amount: rest.reduce((a,v) => a+v.amount, 0)/100, invoices: rest.reduce((a,v) => a+v.invoices, 0)});
  return {rows: rowsOut, excluded};
}

/** Current state of every invoice, independent of the selected period. */
export function pipeline(rows: InvoiceRow[], now = new Date()) {
  const counts = {awaiting: 0, assigned: 0, in_transit: 0, delivered: 0, unknown: 0};
  let outstanding = 0, unpaid = 0, unreadable = 0, overdue = 0, overdueAmount = 0;
  for (const row of rows) {
    const s = row.delivery?.status;
    if (!row.delivery) counts.awaiting++; else if (s === 'assigned' || s === 'in_transit' || s === 'delivered') counts[s]++; else counts.unknown++;
    const state = paymentState(row, now);
    if (state === 'Unpaid' || state === 'Overdue') { const a = cents(row.total_amount); if (a === null) unreadable++; else { outstanding += a; unpaid++; if (state === 'Overdue') { overdue++; overdueAmount += a; } } }
  }
  return {counts, outstanding: unreadable ? null : outstanding/100, unpaid, overdue, overdueAmount: unreadable ? null : overdueAmount/100};
}

export function recentInvoices(rows: InvoiceRow[], limit = 8) {
  return [...rows].filter(r => validDay(r.date_issued)).sort((a,b) => b.date_issued!.localeCompare(a.date_issued!) || b.id.localeCompare(a.id)).slice(0, limit);
}
