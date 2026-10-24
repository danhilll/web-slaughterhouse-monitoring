import test from 'node:test';
import assert from 'node:assert/strict';
import {chartBuckets, previousSpan, kpis, change, animalSeries, moneySeries, feeBreakdown, topVendors, pipeline, recentInvoices} from './dashboardData.ts';
// Wednesday 2026-10-21 10:00 in Manila.
const now = new Date('2026-10-21T02:00:00Z');
const inv = (id: string, day: string, pesos: number, extra: Record<string,unknown> = {}) => ({id, date_issued: day, due_date: day, total_amount: pesos, payment_status: 'Unpaid', corral_fee: 15, delivery_fee: 25, anti_mortem_fee: 10, facility_fee: 45, vendor_id: 'V1', vendor_name: 'Vendor One', ...extra});

test('buckets: Today shows 14 context days; week is Monday to Sunday with future days marked; year has 12 months', () => {
  const day = chartBuckets('day', now); assert.equal(day.length, 14); assert.equal(day.at(-1)!.key, '2026-10-21'); assert.equal(day.some(b => b.future), false);
  const week = chartBuckets('week', now); assert.equal(week[0].key, '2026-10-19'); assert.equal(week.length, 7); assert.deepEqual(week.map(b => b.future), [false,false,false,true,true,true,true]);
  assert.equal(chartBuckets('month', now).length, 31); assert.equal(chartBuckets('year', now).length, 12); assert.equal(chartBuckets('year', now)[9].future, false); assert.equal(chartBuckets('year', now)[10].future, true);
});

test('previous span covers the same elapsed days, capped at the current period start', () => {
  assert.deepEqual(previousSpan('day', now), ['2026-10-20','2026-10-21']);
  assert.deepEqual(previousSpan('week', now), ['2026-10-12','2026-10-15']);
  assert.deepEqual(previousSpan('month', now), ['2026-09-01','2026-09-22']);
  assert.deepEqual(previousSpan('month', new Date('2026-03-31T02:00:00Z')), ['2026-02-01','2026-03-01']);
});

test('kpis and change: unreadable data stays Unavailable and a zero baseline gives no percentage', () => {
  const rows = [inv('A','2026-10-21',95), inv('B','2026-10-20',95,{payment_status:'Paid',payment:{amountCents:9500,recordedAt:'2026-10-21T01:00:00Z'}})];
  const k = kpis(null, rows, 'day', now);
  assert.deepEqual(k.billed, {current: 95, previous: 95}); assert.deepEqual(k.paid, {current: 95, previous: 0}); assert.equal(k.animals.current, null);
  assert.equal(change(k.billed), 0); assert.equal(change(k.paid), null); assert.equal(change({current: 3, previous: 2}), 50);
  assert.equal(kpis(null, [inv('X','not-a-day',95)], 'day', now).billed.current, null);
});

test('animal series counts Pig and Cow per day, leaves future days empty and counts unreadable rows', () => {
  const {data, excluded} = animalSeries([{id:'1',createdAt:'2026-10-19T03:00:00Z',species:'Pig'},{id:'2',createdAt:'2026-10-19T17:00:00Z',species:'Cow'},{id:'3',species:'Pig'},{id:'4',createdAt:'2026-10-20T01:00:00Z',species:'Goat'}], chartBuckets('week', now));
  assert.deepEqual(data[0], {key:'2026-10-19',label:data[0].label,future:false,Pig:1,Cow:0}); assert.equal(data[1].Cow, 1); assert.equal(data[4].Pig, null); assert.equal(excluded, 2);
});

test('money series is a running total in pesos and stops at today', () => {
  const rows = [inv('A','2026-10-19',95), inv('B','2026-10-20',95,{payment_status:'Paid',payment:{amountCents:9500,recordedAt:'2026-10-20T05:00:00Z'}})];
  const {data} = moneySeries(rows, chartBuckets('week', now));
  assert.deepEqual(data.slice(0,3).map(d => [d.Billed, d.Collected]), [[95,0],[190,95],[190,95]]); assert.equal(data[3].Billed, null);
});

test('fee breakdown, top vendors, pipeline and recent invoices', () => {
  const rows = [inv('A','2026-10-21',95), inv('B','2026-10-21',95,{vendor_id:'V2',vendor_name:'Vendor Two',payment_status:'Paid',payment:{amountCents:9500,recordedAt:'2026-10-21T01:00:00Z'},delivery:{status:'delivered',deliveredAt:'2026-10-21T01:30:00Z'}}), inv('C','2026-09-01',95,{delivery:{status:'in_transit'}})];
  const fees = feeBreakdown(rows, ['2026-10-01','2026-11-01']);
  assert.deepEqual(fees.parts.map(p => p.amount), [30,50,20,90]); assert.equal(fees.total, 190); assert.equal(Math.round(fees.parts[3].share*100), 47);
  assert.deepEqual(topVendors(rows, ['2026-10-01','2026-11-01'], 1).rows, [{name:'Vendor One',amount:95,invoices:1},{name:'Other (1)',amount:95,invoices:1}]);
  assert.deepEqual(pipeline(rows, now), {counts:{awaiting:1,assigned:0,in_transit:1,delivered:1,unknown:0},outstanding:190,unpaid:2,overdue:1,overdueAmount:95});
  assert.deepEqual(recentInvoices(rows).map(r => r.id), ['B','A','C']);
});
