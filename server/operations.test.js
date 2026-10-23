import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationsStore, createOperationsRouter, syntheticOperationsEnabled, operationBillingView } from './operations.js';

import {fixture,fees,bill,payment} from './test-support/operations-fixture.js';
test('feature flag cannot enable the new workflows on a live project or remote emulator host',()=>{
  const env={ANIMAL_OPERATIONS_ENABLED:'true',GCLOUD_PROJECT:'demo-test',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9199',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8180'};
  assert.equal(syntheticOperationsEnabled(env,'demo-test'),true);
  assert.equal(syntheticOperationsEnabled(env,'municipal-live'),false);
  assert.equal(syntheticOperationsEnabled({...env,FIRESTORE_EMULATOR_HOST:'remote.example:8180'},'demo-test'),false);
  assert.equal(syntheticOperationsEnabled({...env,GCLOUD_PROJECT:'municipal-live'},'demo-test'),false);
  assert.equal(syntheticOperationsEnabled({...env,FIREBASE_AUTH_EMULATOR_HOST:undefined},'demo-test'),false);
  assert.equal(syntheticOperationsEnabled({...env,ANIMAL_OPERATIONS_ENABLED:'false'},'demo-test'),false);
});

async function inTransit(f){const inv=(await f.call('/animals/ANM-A/invoice','billing',{...bill,dueDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(f.now()))})).body;await f.call(`/invoices/${inv.id}/payment`,'billing',payment(1));await f.call(`/invoices/${inv.id}/delivery`,'inspector',{destinationConfirmed:true,expectedRevision:2,assigneeUid:'delivery',destination:'Synthetic Market / Meat / Stall A'});await f.call(`/invoices/${inv.id}/delivery/status`,'delivery',{expectedRevision:3,status:'in_transit',notes:'Departed'});return inv.id;}

test('tracking updates one position without changing financial revision or audit',async t=>{
  const f=await fixture(t),id=await inTransit(f),before=structuredClone(f.rows.get(`invoices/${id}`));
  const auditBefore=[...f.rows.keys()].filter(k=>k.startsWith('operation_audit/')).length;
  const result=await f.call(`/invoices/${id}/tracking`,'delivery',{latitude:13.96,longitude:122.29,accuracyMeters:10,capturedAt:new Date().toISOString()});
  assert.equal(result.status,200);assert.equal(result.body.trackingState,'recent');assert.deepEqual(f.rows.get(`invoices/${id}`),before);assert.equal([...f.rows.keys()].filter(k=>k.startsWith('operation_audit/')).length,auditBefore);assert.ok(f.rows.has(`delivery_positions/${id}`));
  const vendor=await f.call(`/invoices/${id}/tracking`,'alice');assert.equal(vendor.body.location.latitude,13.96);assert.ok(!JSON.stringify(vendor.body).includes('assigneeUid'));
});
test('tracking authorization excludes other vendors, unassigned staff and non-delivery roles',async t=>{
  const f=await fixture(t),id=await inTransit(f),b={latitude:13.96,longitude:122.29,accuracyMeters:10,capturedAt:new Date().toISOString()};
  for(const who of ['alice','billing','inventory','inspector'])assert.equal((await f.call(`/invoices/${id}/tracking`,who,b)).status,403);
  assert.equal((await f.call(`/invoices/${id}/tracking`,'delivery2',b)).status,403);assert.equal((await f.call(`/invoices/${id}/tracking`,'bob')).status,404);assert.equal((await f.call(`/invoices/${id}/tracking`,'other',b)).status,403);
  f.memberships.delivery.status='inactive';assert.equal((await f.call(`/invoices/${id}/tracking`,'delivery',b)).status,403);
});

test('vendor map reads remain isolated after completion and membership removal',async t=>{
  const f=await fixture(t),id=await inTransit(f),path=`/invoices/${id}/tracking`;
  assert.equal((await f.call(path,'delivery',{latitude:13.96,longitude:122.29,accuracyMeters:12,capturedAt:new Date().toISOString()})).status,200);
  assert.equal((await f.call(`/invoices/${id}/delivery/status`,'delivery',{expectedRevision:4,status:'delivered',notes:'Test completion'})).status,200);
  const own=await f.call(path,'alice');
  assert.equal(own.status,200);assert.equal(own.body.trackingState,'completed');assert.equal(own.body.location,null);
  assert.equal(f.rows.get(`delivery_positions/${id}`).latitude,13.96);
  const other=await f.call(path,'bob');assert.equal(other.status,404);assert.equal(other.body.location,undefined);
  f.memberships.alice.status='inactive';const revoked=await f.call(path,'alice');
  assert.equal(revoked.status,403);assert.equal(revoked.body.location,undefined);
});
test('tracking rate and ordering persist across requests; identical retries are no-op',async t=>{
  let at='2026-10-13T02:00:00.000Z';const f=await fixture(t,true,()=>at),id=await inTransit(f),path=`/invoices/${id}/tracking`,b={latitude:13.96,longitude:122.29,accuracyMeters:10,capturedAt:at};
  assert.equal((await f.call(path,'delivery',b)).status,200);assert.equal((await f.call(path,'delivery',b)).body.duplicate,true);
  at='2026-10-13T02:00:01.000Z';assert.equal((await f.call(path,'delivery',{...b,capturedAt:at,latitude:14})).status,429);
  at='2026-10-13T02:00:10.000Z';assert.equal((await f.call(path,'delivery',{...b,capturedAt:at,latitude:14})).status,200);
  assert.equal((await f.call(path,'delivery',b)).status,409);assert.equal((await f.call(path,'delivery',{...b,capturedAt:at,latitude:15})).status,409);
  assert.equal(f.rows.get(`invoices/${id}`).revision,4);
});
test('concurrent GPS writers have one winner without disturbing completion',async t=>{
  const f=await fixture(t),id=await inTransit(f),at=new Date().toISOString(),b={latitude:13.96,longitude:122.29,accuracyMeters:10,capturedAt:at};
  const results=await Promise.all([f.call(`/invoices/${id}/tracking`,'delivery',b),f.call(`/invoices/${id}/tracking`,'delivery',{...b,latitude:14})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await f.call(`/invoices/${id}/delivery/status`,'delivery',{expectedRevision:4,status:'delivered',notes:'Arrived'})).status,200);
  assert.equal((await f.call(`/invoices/${id}/tracking`,'delivery',b)).status,409);assert.equal((await f.call(`/invoices/${id}/tracking`,'alice')).body.trackingState,'completed');
});
test('stale position is derived without writes, and reassignment hides old coordinates',async t=>{
  let at='2026-10-13T02:00:00.000Z';const f=await fixture(t,true,()=>at),id=await inTransit(f),path=`/invoices/${id}/tracking`;
  await f.call(path,'delivery',{latitude:13.96,longitude:122.29,accuracyMeters:10,capturedAt:at});const stored=structuredClone(f.rows.get(`delivery_positions/${id}`));
  at='2026-10-13T02:01:00.000Z';const view=await f.call(path,'alice');assert.equal(view.body.trackingState,'stale');assert.deepEqual(f.rows.get(`delivery_positions/${id}`),stored);
  f.rows.get(`invoices/${id}`).delivery.assigneeUid='delivery2';assert.equal((await f.call(path,'alice')).body.location,null);assert.equal((await f.call(path,'delivery')).status,404);
});
test('tracking rejects invalid positions, unsupported fields and filters',async t=>{
  const f=await fixture(t),id=await inTransit(f),path=`/invoices/${id}/tracking`,b={latitude:13.96,longitude:122.29,accuracyMeters:10,capturedAt:new Date().toISOString()};
  for(const bad of [{...b,latitude:91},{...b,accuracyMeters:-1},{...b,capturedAt:'2020-01-01T00:00:00Z'},{...b,expectedRevision:4},{...b,capturedAt:'2099-01-01T00:00:00Z'}])assert.equal((await f.call(path,'delivery',bad)).status,400);
  assert.equal((await f.call(path+'?vendor_id=OTHER','alice')).status,400);assert.equal(f.rows.has(`delivery_positions/${id}`),false);
});
test('tracking request bursts are bounded and invalid stored coordinates fail closed',async t=>{
  const f=await fixture(t),id=await inTransit(f),path=`/invoices/${id}/tracking`;
  f.rows.set(`delivery_positions/${id}`,{invoiceId:id,municipalScopeId:'SCOPE',vendor_id:'VEN-A',assigneeUid:'delivery',assignedAt:new Date().toISOString(),receivedAt:new Date().toISOString(),capturedAt:new Date().toISOString(),latitude:999,longitude:0,accuracyMeters:10});
  assert.equal((await f.call(path,'alice')).status,503);
  f.rows.delete(`delivery_positions/${id}`);
  for(let n=0;n<29;n++)assert.equal((await f.call(path,'alice')).status,200);
  assert.equal((await f.call(path,'alice')).status,429);
});
test('operations are independently gated and require active matching membership',async t=>{
  const {call,memberships}=await fixture(t,false);
  assert.equal((await call('/settings')).body.enabled,false);assert.equal((await call('/invoices')).status,503);
  assert.equal((await call('/invoices',null)).status,401);assert.equal((await call('/invoices','expired')).status,401);
  memberships.billing.status='inactive';assert.equal((await call('/settings')).status,403);
});
test('server prices a single approved revision and prevents concurrent duplicate billing',async t=>{
  const {call,rows}=await fixture(t);
  const results=await Promise.all([call('/animals/ANM-A/invoice','billing',bill),call('/animals/ANM-A/invoice','billing',bill)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);const inv=results.find(r=>r.status===201).body;
  assert.equal(inv.total_amount,95);assert.equal(inv.number_of_heads_pig,1);assert.equal(inv.corral_fee,15);assert.equal(inv.animalRevision,1);
  assert.equal(rows.get('animal_records/ANM-A').billingInvoiceId,inv.id);assert.equal([...rows.keys()].filter(k=>k.startsWith('invoices/')).length,1);
  assert.equal((await call('/eligible')).body.items.length,1);
});
for(const [at,issueDate,previousDate] of [
  ['2026-10-14T15:59:59.999Z','2026-10-14','2026-10-13'],
  ['2026-10-14T16:00:00.000Z','2026-10-15','2026-10-14'],
  ['2026-10-14T16:00:00.001Z','2026-10-15','2026-10-14'],
  ['2026-12-31T16:00:00.000Z','2027-01-01','2026-12-31']
])test(`billing uses Manila calendar dates at ${at} and preserves UTC audit timestamps`,async t=>{
  const {call,rows}=await fixture(t,true,()=>at);
  const before=structuredClone(rows);
  const rejected=await call('/animals/ANM-A/invoice','billing',{...bill,dueDate:previousDate});
  assert.equal(rejected.status,400);
  assert.deepEqual(rows,before,'Rejected due dates must not write any records');
  const accepted=await call('/animals/ANM-A/invoice','billing',{...bill,dueDate:issueDate});
  assert.equal(accepted.status,201);
  assert.equal(accepted.body.date_issued,issueDate);
  assert.equal(accepted.body.due_date,issueDate);
  assert.equal(accepted.body.total_amount,95);
  assert.equal(rows.get(`invoices/${accepted.body.id}`).createdAt,at);
  assert.equal(rows.get('animal_records/ANM-A').updatedAt,at);
  const audit=[...rows].find(([key])=>key.startsWith('operation_audit/'))[1];
  assert.equal(audit.at,at);
  assert.equal(audit.after.date_issued,issueDate);
});
test('billing validates and issues against one instant when the clock crosses Manila midnight',async t=>{
  let calls=0;
  const beforeMidnight='2026-10-14T15:59:59.999Z';
  const {call,rows}=await fixture(t,true,()=>calls++===0?beforeMidnight:'2026-10-14T16:00:00.000Z');
  const result=await call('/animals/ANM-A/invoice','billing',{...bill,dueDate:'2026-10-14'});
  assert.equal(result.status,201);
  assert.equal(calls,1);
  assert.equal(result.body.date_issued,'2026-10-14');
  assert.equal(rows.get(`invoices/${result.body.id}`).createdAt,beforeMidnight);
});
test('pending stale cross-scope or inactive-vendor animals cannot be billed',async t=>{
  const {call,rows}=await fixture(t);const a=rows.get('animal_records/ANM-A');
  a.inspection.status='pending';assert.equal((await call('/animals/ANM-A/invoice','billing',bill)).status,409);
  a.inspection.status='approved';assert.equal((await call('/animals/ANM-A/invoice','billing',{...bill,expectedRevision:2})).status,409);
  assert.equal((await call('/animals/ANM-A/invoice','other',bill)).status,404);
  rows.get('vendors/VEN-A').status='Inactive';assert.equal((await call('/animals/ANM-A/invoice','billing',bill)).status,409);
});
test('billing role, amounts, fee versions and field injection are checked',async t=>{
  const {call,rows}=await fixture(t);
  for(const who of ['inventory','inspector','alice','delivery'])assert.equal((await call('/animals/ANM-A/invoice',who,bill)).status,403);
  assert.equal((await call('/animals/ANM-A/invoice','billing',{...bill,total_amount:1})).status,400);
  assert.equal((await call('/animals/ANM-A/invoice','billing',{...bill,feeScheduleVersion:2})).status,409);
  rows.get('operation_fee_schedules/SCOPE').status='draft';assert.equal((await call('/animals/ANM-A/invoice','billing',bill)).status,503);
  assert.equal((await call('/settings')).body.feeSchedule,null);
});
test('vendor invoice reads stay scoped and private storage fields are not projected',async t=>{
  const {call,rows}=await fixture(t);const inv=(await call('/animals/ANM-A/invoice','billing',bill)).body;
  assert.equal((await call('/invoices','alice')).body.items[0].id,inv.id);
  assert.deepEqual((await call('/invoices','bob')).body.items,[]);assert.equal((await call(`/invoices/${inv.id}`,'bob')).status,404);
  assert.equal((await call(`/invoices/${inv.id}`,'other')).status,404);assert.ok(!('totalCents' in inv));assert.ok(!('createdBy' in inv));
  await call(`/invoices/${inv.id}/payment`,'billing',payment(1));rows.get(`invoices/${inv.id}`).payment.privateContact='PRIVATE';
  assert.ok(!JSON.stringify((await call(`/invoices/${inv.id}`,'alice')).body).includes('PRIVATE'));
});
test('operations invoice headcounts use Android Int bounds without repairing stored records',async t=>{
  const {call,rows}=await fixture(t);
  const inv=(await call('/animals/ANM-A/invoice','billing',bill)).body;
  const original=structuredClone(rows.get(`invoices/${inv.id}`));
  for(const field of ['number_of_heads_cow','number_of_heads_pig']){
    for(const count of [0,2147483647,2147483648,-1,0.5]){
      rows.set(`invoices/${inv.id}`,{...original,[field]:count});
      const before=structuredClone(rows);
      const valid=count===0||count===2147483647;
      const result=await call(`/invoices/${inv.id}`,'alice');
      assert.equal(result.status,valid?200:503);
      assert.equal((await call('/invoices','alice')).status,valid?200:503);
      if(valid)assert.equal(result.body[field],count);
      else assert.equal((await call(`/invoices/${inv.id}/payment`,'billing',payment(1))).status,503);
      assert.deepEqual(rows,before);
    }
  }
});
test('full payment is transactional, references are unique and stale or duplicate recording fails',async t=>{
  const {call}=await fixture(t);const a=(await call('/animals/ANM-A/invoice','billing',bill)).body,b=(await call('/animals/ANM-B/invoice','billing',bill)).body;
  assert.equal((await call(`/invoices/${a.id}/payment`,'delivery',payment(1))).status,403);
  assert.equal((await call(`/invoices/${a.id}/payment`,'billing',{...payment(1),amountCents:1})).status,400);
  const results=await Promise.all([call(`/invoices/${a.id}/payment`,'billing',payment(1)),call(`/invoices/${a.id}/payment`,'billing',payment(1))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await call(`/invoices/${b.id}/payment`,'billing',payment(1))).status,409);
  const paid=(await call(`/invoices/${a.id}`)).body;assert.equal(paid.payment_status,'Paid');assert.equal(paid.payment.amountCents,9500);assert.equal(paid.revision,2);
});
test('Inspector assigns verified stall and active delivery staff; only assignee advances ordered statuses',async t=>{
  const {call,memberships}=await fixture(t);const inv=(await call('/animals/ANM-A/invoice','billing',bill)).body;
  const assign={expectedRevision:1,assigneeUid:'delivery',destination:'Synthetic Market / Meat / Stall A',destinationConfirmed:true};
  assert.equal((await call(`/invoices/${inv.id}/delivery`,'delivery',assign)).status,403);
  await call(`/invoices/${inv.id}/payment`,'billing',payment(1));assign.expectedRevision=2;
  memberships.delivery2.status='pending';assert.equal((await call(`/invoices/${inv.id}/delivery`,'inspector',{destinationConfirmed:true,...assign,assigneeUid:'delivery2'})).status,400);memberships.delivery2.status='active';
  const assigned=await call(`/invoices/${inv.id}/delivery`,'inspector',assign);assert.equal(assigned.status,200);assert.equal(assigned.body.status,'assigned');assert.equal(assigned.body.projection,'delivery_assignment_confirmation_v1');
  assert.equal((await call(`/invoices/${inv.id}/delivery/status`,'delivery2',{expectedRevision:3,status:'in_transit',notes:'Test departure'})).status,403);
  assert.equal((await call(`/invoices/${inv.id}/delivery/status`,'delivery',{expectedRevision:3,status:'delivered',notes:'Test arrival'})).status,409);
  assert.equal((await call(`/invoices/${inv.id}/delivery/status`,'delivery',{expectedRevision:3,status:'in_transit',notes:'Test departure'})).status,200);
  assert.equal((await call(`/invoices/${inv.id}/delivery/status`,'delivery',{expectedRevision:4,status:'delivered',notes:'Test arrival'})).status,200);
  assert.equal((await call(`/invoices/${inv.id}/delivery/status`,'delivery',{expectedRevision:5,status:'in_transit',notes:'Test repeat'})).status,409);
});
test('delivery location validates fresh coordinates, assignment and permission removal',async t=>{
  const {call,memberships}=await fixture(t);const inv=(await call('/animals/ANM-A/invoice','billing',bill)).body;
  await call(`/invoices/${inv.id}/payment`,'billing',payment(1));await call(`/invoices/${inv.id}/delivery`,'inspector',{destinationConfirmed:true,expectedRevision:2,assigneeUid:'delivery',destination:'Synthetic Market / Meat / Stall A'});
  const location={expectedRevision:3,latitude:13.96,longitude:122.29,accuracyMeters:10,capturedAt:new Date().toISOString()};
  assert.equal((await call(`/invoices/${inv.id}/delivery/location`,'delivery',{...location,latitude:91})).status,400);
  assert.equal((await call(`/invoices/${inv.id}/delivery/location`,'delivery',{...location,capturedAt:'2020-01-01T00:00:00Z'})).status,400);
  assert.equal((await call(`/invoices/${inv.id}/delivery/location`,'delivery2',location)).status,403);
  assert.equal((await call(`/invoices/${inv.id}/delivery/location`,'delivery',location)).status,200);
  memberships.delivery.staffPermissions=[];assert.equal((await call('/invoices','delivery')).status,403);
});
test('workflow pagination is bounded and cursors reject other accounts, endpoints and tampering',async t=>{
  const {call,rows}=await fixture(t);const inv=(await call('/animals/ANM-A/invoice','billing',bill)).body;
  const original=rows.get(`invoices/${inv.id}`);
  for(let n=0;n<26;n++){const value=`AINV-PAGE-${String(n).padStart(3,'0')}`;rows.set(`invoices/${value}`,{...original,id:value});}
  const first=await call('/invoices');assert.equal(first.body.items.length,25);assert.ok(first.body.nextCursor);
  const second=await call(`/invoices?cursor=${encodeURIComponent(first.body.nextCursor)}`);assert.equal(second.body.items.length,2);assert.equal(second.body.nextCursor,null);
  assert.equal((await call(`/invoices?cursor=${encodeURIComponent(first.body.nextCursor)}`,'delivery')).status,400);
  assert.equal((await call(`/eligible?cursor=${encodeURIComponent(first.body.nextCursor)}`)).status,400);
  assert.equal((await call(`/invoices?cursor=${encodeURIComponent(first.body.nextCursor+'x')}`)).status,400);
  assert.equal((await call('/invoices?vendor_id=VEN-B')).status,400);
});

test('production rollback preserves invoice and tracking reads with all mutations closed',async t=>{
  const source=await fixture(t);const id=await inTransit(source);
  const production={municipalScopeId:'SCOPE',features:{billing:false,payment:false,delivery:false,tracking:false}};
  const f=await fixture(t,false,undefined,production);f.rows.set(`invoices/${id}`,source.rows.get(`invoices/${id}`));
  const settings=(await f.call('/settings')).body;
  assert.equal(settings.enabled,true);assert.equal(settings.canBill,false);assert.equal(settings.canDeliver,false);assert.equal(settings.canRecordPayment,false);assert.equal(settings.canPublishTracking,false);assert.equal(settings.feeSchedule,null);
  assert.equal((await f.call(`/invoices/${id}`,'alice')).status,200);
  assert.equal((await f.call(`/invoices/${id}`,'bob')).status,404);
  assert.equal((await f.call('/invoices','other')).status,403);
  assert.equal((await f.call(`/invoices/${id}/tracking`,'alice')).status,200);
  for(const [path,who] of [['/animals/ANM-B/invoice','billing'],[`/invoices/${id}/payment`,'billing'],[`/invoices/${id}/delivery`,'delivery'],[`/invoices/${id}/delivery/status`,'delivery'],[`/invoices/${id}/tracking`,'delivery'],[`/invoices/${id}/delivery/location`,'delivery']])assert.equal((await f.call(path,who,{})).status,503);
  f.memberships.delivery.status='inactive';assert.equal((await f.call(`/invoices/${id}/tracking`,'delivery')).status,403);
});

test('paused gates retain distinct read workspace flags without granting writes or Vendor staff access',async t=>{
 const production={municipalScopeId:'SCOPE',features:{billing:false,payment:false,delivery:false,tracking:false}};
 const f=await fixture(t,false,undefined,production);
 for(const [who,billing,delivery]of [['billing',true,false],['delivery',false,true],['multi',true,true],['alice',false,false]]){
  const r=await f.call('/settings',who);assert.equal(r.status,200);assert.equal(r.body.workspaceContract,'billing_delivery_v1');
  assert.equal(r.body.canReadBilling,billing);assert.equal(r.body.canReadEligible,billing);assert.equal(r.body.canReadDelivery,delivery);
  for(const k of ['canBill','canDeliver','canRecordPayment','canPublishTracking'])assert.equal(r.body[k],false);
 }
 assert.equal((await f.call('/eligible','billing')).status,200);assert.equal((await f.call('/deliveries','billing')).status,403);assert.equal((await f.call('/eligible','delivery')).status,403);
 assert.equal((await f.call('/deliveries','alice')).status,403);
});
test('Delivery sees only own municipal assignments; multi-permission Staff retain independent Billing scope',async t=>{
 const f=await fixture(t),own=await inTransit(f);
 const other=(await f.call('/animals/ANM-B/invoice','billing',bill)).body;
 await f.call(`/invoices/${other.id}/payment`,'billing',{...payment(1),receiptReference:'SECOND'});
 await f.call(`/invoices/${other.id}/delivery`,'inspector',{destinationConfirmed:true,expectedRevision:2,assigneeUid:'delivery2',destination:'Synthetic Market / Meat / Stall A'});
 for(const a of ['A','B'])Object.assign(f.rows.get('animal_records/ANM-'+a),{weighedAt:'2026-10-20T01:00:00.000Z',inspection:{status:'approved',revision:1,notes:'PRIVATE INSPECTION',inspectorUid:'private-inspector'}});
 const list=await f.call('/deliveries','delivery');assert.equal(list.status,200);assert.deepEqual(list.body.items.map(x=>x.id),[own]);
 const item=list.body.items[0];assert.equal(item.projection,'delivery_assignment_v1');assert.equal(item.meatDetails.species,'Pig');assert.equal(item.meatDetails.carcassEstimate.weightGrams,68001);assert.equal(item.meatDetails.carcassWeight.weightGrams,60000);
 for(const field of ['payment','total_amount','totalCents','balanceCents','inspection','createdBy','updatedBy'])assert.ok(!(field in item));
 assert.ok(!JSON.stringify(item).includes('PRIVATE INSPECTION'));assert.ok(!JSON.stringify(item).includes('private-inspector'));
 assert.equal((await f.call('/deliveries/'+other.id,'delivery')).status,404);
 assert.equal((await f.call('/deliveries/'+own,'otherDelivery')).status,404);assert.equal((await f.call('/deliveries','otherDelivery')).body.items.length,0);
 const adminAssignments=await f.store.deliveries({role:'admin',uid:'admin',municipalScopeId:'SCOPE'});assert.equal(adminAssignments.length,2);
 assert.equal((await f.call('/invoices/'+other.id,'delivery')).status,404);
 assert.deepEqual((await f.call('/invoices','delivery')).body.items.map(x=>x.id),[own]);
 assert.equal((await f.call('/invoices','multi')).body.items.length,2);assert.equal((await f.call('/deliveries','multi')).body.items.length,0);
 assert.equal((await f.call('/invoices','bob')).body.items.length,0);
 const next=await f.call('/deliveries/'+own+'/status','delivery',{expectedRevision:4,status:'delivered',notes:'Confirmed received'});
 assert.equal(next.status,200);assert.equal(next.body.delivery.status,'delivered');assert.equal(next.body.projection,'delivery_assignment_v1');assert.ok(!('payment' in next.body));
 assert.equal((await f.call('/deliveries/'+own+'/status','delivery',{expectedRevision:4,status:'delivered',notes:'Again'})).status,409);
 assert.ok([...f.rows.values()].some(x=>x.action==='delivery_status'&&x.after?.revision===5));
});
test('Delivery cursor bindings reject another account and Billing endpoint; request filters fail closed',async t=>{
 const f=await fixture(t),id=await inTransit(f),base=f.rows.get('invoices/'+id);
 f.rows.delete('invoices/'+id);
 for(let i=0;i<27;i++)f.rows.set('invoices/INV-'+String(i).padStart(3,'0'),{...structuredClone(base),id:'INV-'+String(i).padStart(3,'0')});
 const first=await f.call('/deliveries','delivery');assert.equal(first.status,200);assert.equal(first.body.items.length,25);assert.ok(first.body.nextCursor);
 const next=await f.call('/deliveries?cursor='+encodeURIComponent(first.body.nextCursor),'delivery');assert.equal(next.body.items.length,2);
 assert.equal((await f.call('/deliveries?cursor='+encodeURIComponent(first.body.nextCursor),'delivery2')).status,400);
 assert.equal((await f.call('/invoices?cursor='+encodeURIComponent(first.body.nextCursor),'delivery')).status,400);
 assert.equal((await f.call('/deliveries?assigneeUid=delivery2','delivery')).status,400);
});
test('production invoice issuance rejects synthetic/unproven fees and stores immutable approved fee snapshot',async t=>{
 const f=await fixture(t,true,undefined,{municipalScopeId:'SCOPE',features:{billing:true,payment:false,delivery:false,tracking:false}});
 assert.equal((await f.call('/animals/ANM-A/invoice','billing',bill)).status,503);
 const s=f.rows.get('operation_fee_schedules/SCOPE');s.syntheticOnly=false;
 assert.equal((await f.call('/animals/ANM-A/invoice','billing',bill)).status,503);
 s.approvalReference='OWNER-APPROVED-TEST-REFERENCE';
 const issued=await f.call('/animals/ANM-A/invoice','billing',bill);assert.equal(issued.status,201);const priced=(await f.call('/billing/invoices/'+issued.body.id,'billing')).body;assert.equal(priced.totalCents,9500);assert.equal(priced.paidCents,0);assert.equal(priced.balanceCents,9500);assert.equal(priced.feeScheduleSnapshot.approvalReference,s.approvalReference);
 assert.equal((await f.call('/billing/invoices','alice')).status,403);assert.equal((await f.call('/billing/invoices','delivery')).status,403);
 s.facilityCents=6000;s.version=2;
 const again=await f.call('/billing/invoices/'+issued.body.id,'billing');assert.equal(again.body.feeScheduleSnapshot.facilityCents,4500);assert.equal(again.body.totalCents,9500);
 assert.equal((await f.call('/invoices/'+issued.body.id+'/payment','billing',payment(1))).status,503);
 assert.equal((await f.call('/deliveries/'+issued.body.id+'/status','delivery',{expectedRevision:1,status:'in_transit',notes:'No assignment'})).status,503);
});

test('new Billing projection never copies legacy delivery coordinates into its workspace response',()=>{const row={totalCents:9500,payment_status:'Unpaid',delivery:{assigneeUid:'D',destination:'Recorded',status:'assigned',location:{latitude:1,longitude:2,accuracyMeters:3,capturedAt:'2026-10-21T01:00:00Z'}}};const view=operationBillingView(row);assert.equal(view.balanceCents,9500);assert.ok(!('location' in view.delivery));assert.ok(row.delivery.location);});

test('invoice preview resolves active owning vendor and exact itemized fees without writes; issue rechecks and vendors isolate',async t=>{
 const f=await fixture(t),before=structuredClone([...f.rows]);
 const p=await f.call('/animals/ANM-A/invoice-preview');assert.equal(p.status,200);assert.equal(p.body.projection,'invoice_preview_v1');assert.deepEqual(p.body.vendor,{id:'VEN-A',name:'Synthetic A'});assert.equal(p.body.animal.vendorBusinessId,p.body.vendor.id);assert.equal(p.body.animal.municipalScopeId,'SCOPE');assert.equal(p.body.totalCents,9500);assert.deepEqual(p.body.feeSchedule,((({status,...rest})=>rest)(fees)));assert.deepEqual([...f.rows],before);
 for(const role of ['delivery','inventory','inspector','alice','bob'])assert.equal((await f.call('/animals/ANM-A/invoice-preview',role)).status,403);
 assert.equal((await f.call('/animals/ANM-A/invoice-preview','other')).status,404);assert.equal((await f.call('/animals/ANM-A/invoice-preview?fee=1')).status,400);
 const issued=await f.call('/animals/ANM-A/invoice','billing',{...bill,expectedRevision:p.body.animal.revision,feeScheduleVersion:p.body.feeSchedule.version});assert.equal(issued.status,201);assert.equal(issued.body.vendor_id,p.body.vendor.id);
 assert.equal((await f.call('/animals/ANM-A/invoice-preview')).status,409);assert.equal((await f.call('/animals/ANM-A/invoice','billing',bill)).status,409);
 assert.equal((await f.call('/invoices/'+issued.body.id,'alice')).status,200);assert.equal((await f.call('/invoices/'+issued.body.id,'bob')).status,404);
 const balance=await f.call('/billing/invoices/'+issued.body.id);assert.equal(balance.body.balanceCents,9500);assert.equal(balance.body.paidCents,0);
 const audits=[...f.rows].filter(([k])=>k.startsWith('operation_audit/'));assert.equal(audits.length,1);assert.equal(audits[0][1].action,'invoice_issued');assert.equal(audits[0][1].after.vendor_id,'VEN-A');
});
test('preview cannot authorize stale ownership, approval, fees or duplicates; no synthetic production substitution',async t=>{
 const f=await fixture(t);assert.equal((await f.call('/animals/ANM-A/invoice-preview')).status,200);
 f.rows.get('vendors/VEN-A').municipalScopeId='OTHER';assert.equal((await f.call('/animals/ANM-A/invoice-preview')).status,409);assert.equal((await f.call('/animals/ANM-A/invoice','billing',bill)).status,409);f.rows.get('vendors/VEN-A').municipalScopeId='SCOPE';
 f.rows.get('animal_records/ANM-A').inspection.revision=2;assert.equal((await f.call('/animals/ANM-A/invoice-preview')).status,409);f.rows.get('animal_records/ANM-A').inspection.revision=1;
 f.rows.get('operation_fee_schedules/SCOPE').version=2;assert.equal((await f.call('/animals/ANM-A/invoice','billing',bill)).status,409);
 assert.equal([...f.rows.keys()].filter(k=>k.startsWith('invoices/')||k.startsWith('operation_audit/')).length,0);
 const production={municipalScopeId:'SCOPE',features:{billing:false,payment:false,delivery:false,tracking:false}};const prod=await fixture(t,true,undefined,production);
 assert.equal((await prod.call('/animals/ANM-A/invoice-preview')).status,503);
 prod.rows.set('operation_fee_schedules/SCOPE',{...fees,syntheticOnly:false,approvalReference:'TEST approval only'});
 assert.equal((await prod.call('/animals/ANM-A/invoice-preview')).status,200);assert.equal((await prod.call('/animals/ANM-A/invoice','billing',bill)).status,503);assert.equal([...prod.rows.keys()].filter(k=>k.startsWith('invoices/')).length,0);
});
test('isolated connected preview→invoice→Vendor balance→assigned delivery→authorized MAPCN position contract',async t=>{
 const f=await fixture(t);f.rows.get('animal_records/ANM-A').weighedAt='2026-10-21T01:00:00Z';
 const preview=await f.call('/animals/ANM-A/invoice-preview');assert.equal(preview.status,200);
 const issued=await f.call('/animals/ANM-A/invoice','billing',{...bill,expectedRevision:preview.body.animal.revision,feeScheduleVersion:preview.body.feeSchedule.version});assert.equal(issued.status,201);const path='/invoices/'+issued.body.id;
 assert.equal((await f.call(path,'alice')).body.payment_status,'Unpaid');assert.equal((await f.call(path,'bob')).status,404);
 assert.equal((await f.rawCall(path+'/delivery','delivery',{destinationConfirmed:true,expectedRevision:1,assigneeUid:'delivery',destination:'Synthetic Market / Meat / Stall A'})).status,403);
 assert.equal((await f.call(path+'/payment','billing',payment(1))).status,200);const balance=(await f.call('/billing/invoices/'+issued.body.id)).body;assert.equal(balance.balanceCents,0);assert.equal(balance.paidCents,9500);
 assert.equal((await f.call(path+'/delivery','inspector',{destinationConfirmed:true,expectedRevision:2,assigneeUid:'delivery',destination:'Synthetic Market / Meat / Stall A'})).status,200);
 const assignment=await f.call('/deliveries/'+issued.body.id,'delivery');assert.equal(assignment.status,200);assert.equal(assignment.body.delivery.destination,'Synthetic Market / Meat / Stall A');assert.equal(assignment.body.delivery.location,undefined);assert.equal(assignment.body.meatDetails.carcassWeight.weightGrams,60000);assert.equal(assignment.body.meatDetails.carcassWeightSelection.source,'measured');assert.equal((await f.call('/deliveries/'+issued.body.id,'delivery2')).status,404);
 assert.equal((await f.call(path+'/tracking','delivery')).body.location,null);
 assert.equal((await f.call('/deliveries/'+issued.body.id+'/status','delivery',{expectedRevision:3,status:'in_transit',notes:'Synthetic departure'})).status,200);
 const location={latitude:13.96,longitude:122.29,accuracyMeters:10,capturedAt:new Date().toISOString()};assert.equal((await f.call(path+'/tracking','delivery',location)).status,200);assert.equal((await f.call(path+'/tracking','alice')).body.location.latitude,13.96);assert.equal((await f.call(path+'/tracking','bob')).status,404);assert.equal((await f.call(path+'/tracking','delivery2')).status,404);
 assert.equal(f.rows.get('invoices/'+issued.body.id).revision,4);assert.equal([...f.rows.keys()].filter(k=>k.startsWith('operation_audit/')).length,4);
});

test('owner policy denies admin finance, permits only Billing cash and preserves approved snapshots',async t=>{
 const f=await fixture(t);const settings=await f.webCall('/settings');assert.equal(settings.status,200);assert.equal(settings.body.canReadBilling,true);assert.equal(settings.body.canBill,false);assert.equal(settings.body.canRecordPayment,false);assert.equal(settings.body.canDeliver,false);
 assert.equal((await f.webCall('/animals/ANM-A/invoice',bill)).status,403);
 const issued=await f.call('/animals/ANM-A/invoice','billing',bill);assert.equal(issued.status,201);const path='/invoices/'+issued.body.id;
 assert.equal((await f.webCall(path+'/payment',payment(1))).status,403);assert.equal((await f.call(path+'/payment','billing',{...payment(1),method:'bank_transfer'})).status,400);
 const original=structuredClone(f.rows.get('invoices/'+issued.body.id));f.rows.set('operation_fee_schedules/SCOPE',{...fees,version:2,facilityCents:4600});assert.equal((await f.call('/animals/ANM-B/invoice-preview')).status,503);assert.deepEqual(f.rows.get('invoices/'+issued.body.id),original);
 f.rows.set('operation_fee_schedules/SCOPE',{...fees,version:2,tableFeeCents:0});assert.equal((await f.call('/animals/ANM-B/invoice-preview')).status,503);
 assert.equal((await f.call(path+'/payment','billing',payment(1))).status,200);const before=f.rows.get('invoices/'+issued.body.id);const audits=[...f.rows].filter(([k])=>k.startsWith('operation_audit/')).map(([,v])=>v);const event=audits.find(x=>x.action==='payment_recorded');assert.equal(event.before.payment_status,'Unpaid');assert.equal(event.after.payment_status,'Paid');assert.equal(event.actorUid,'billing');assert.ok(event.at);assert.deepEqual(before.feeScheduleSnapshot,original.feeScheduleSnapshot);
});
test('owner flow dispatches unpaid measured animal by Inspector and web oversight reconciles same records after cash',async t=>{
 const f=await fixture(t);assert.equal((await f.call('/settings','inspector')).body.canReadAssignmentCandidates,true);
 const inv=(await f.call('/animals/ANM-A/invoice','billing',bill)).body,path='/invoices/'+inv.id;
 const options=await f.call(path+'/assignment-options','inspector');assert.equal(options.status,200);assert.equal(options.body.destination,'Synthetic Market / Meat / Stall A');assert.ok(!('totalCents' in options.body));
 const candidates=await f.call('/assignment-candidates','inspector');assert.equal(candidates.body.items[0].invoiceId,inv.id);assert.ok(!('payment' in candidates.body.items[0]));
 const staff=await f.call('/delivery-staff','inspector');assert.ok(staff.body.items.some(x=>x.uid==='delivery'));assert.ok(staff.body.items.every(x=>!('email' in x)));
 const assign={expectedRevision:1,assigneeUid:'delivery',destination:options.body.destination,destinationConfirmed:true};
 for(const actor of ['billing','delivery','inventory','alice'])assert.equal((await f.call(path+'/delivery',actor,assign)).status,403);
 assert.equal((await f.webCall(path+'/delivery',assign)).status,403);assert.equal((await f.call(path+'/delivery','inspector',{...assign,destinationConfirmed:false})).status,409);
 assert.equal((await f.call(path+'/delivery','inspector',assign)).status,200);let current=f.rows.get('invoices/'+inv.id);assert.equal(current.payment_status,'Unpaid');assert.equal(current.delivery.destinationVerification.verifiedBy,'inspector');
 assert.equal((await f.call('/deliveries/'+inv.id+'/status','delivery',{expectedRevision:2,status:'in_transit',notes:'Synthetic departure before payment'})).status,200);
 const point={latitude:13.96,longitude:122.29,accuracyMeters:10,capturedAt:new Date().toISOString()};assert.equal((await f.call(path+'/tracking','delivery',point)).status,200);
 const first=await f.webCall('/oversight'+path);assert.equal(first.status,200);assert.equal(first.body.invoice.id,inv.id);assert.equal(first.body.invoice.balanceCents,9500);assert.equal(first.body.assignment.delivery.status,'in_transit');assert.equal(first.body.animal.carcassWeight.weightGrams,60000);assert.equal(first.body.tracking.location.latitude,point.latitude);
 assert.equal((await f.call(path+'/payment','billing',payment(3))).status,200);const last=await f.webCall('/oversight'+path);assert.equal(last.body.invoice.id,inv.id);assert.equal(last.body.invoice.balanceCents,0);assert.equal(last.body.invoice.payment.receiptReference,'TEST-RECEIPT');assert.equal(last.body.assignment.delivery.status,'in_transit');assert.equal(last.body.invoice.totalCents,first.body.invoice.totalCents);
 assert.equal((await f.call('/oversight'+path,'billing')).status,403);assert.equal((await f.call(path,'bob')).status,404);assert.equal((await f.call('/deliveries/'+inv.id,'delivery2')).status,404);
});
test('measurement/stall/current revision and same-day rules fail closed without writes',async t=>{
 const f=await fixture(t);const a=f.rows.get('animal_records/ANM-A'),original=structuredClone(a.carcassWeight);
 for(const c of [null,{...original,animalRevision:2},{...original,weightGrams:0}]){a.carcassWeight=c;assert.equal((await f.call('/animals/ANM-A/invoice-preview')).status,409);assert.equal((await f.call('/animals/ANM-A/invoice','billing',bill)).status,409);}
 a.carcassWeight=original;assert.equal((await f.call('/animals/ANM-A/invoice','billing',{...bill,dueDate:'2099-01-01'})).status,400);
 const inv=(await f.call('/animals/ANM-A/invoice','billing',bill)).body;const path='/invoices/'+inv.id;
 f.rows.get('vendors/VEN-A').stallNumber='UNRESERVED';assert.equal((await f.call(path+'/assignment-options','inspector')).status,409);f.rows.get('vendors/VEN-A').stallNumber='A';
 const expected=await f.call(path+'/assignment-options','inspector');assert.equal(expected.status,200);assert.equal((await f.call(path+'/delivery','inspector',{expectedRevision:1,assigneeUid:'delivery',destination:'Invented destination',destinationConfirmed:true})).status,409);
 assert.equal(f.rows.get('invoices/'+inv.id).revision,1);assert.equal(f.rows.get('invoices/'+inv.id).delivery,undefined);
});
test('Cow and Pig each use approved PHP95; another species cannot borrow their rates',async t=>{
 const f=await fixture(t);f.rows.get('animal_records/ANM-B').species='Cow';
 for(const [id,species] of [['ANM-A','Pig'],['ANM-B','Cow']]){const r=await f.call('/animals/'+id+'/invoice','billing',bill);assert.equal(r.status,201);assert.equal(r.body.total_amount,95);assert.equal(r.body.number_of_heads_cow,species==='Cow'?1:0);assert.equal(r.body.number_of_heads_pig,species==='Pig'?1:0);}
 const g=await fixture(t);g.rows.get('animal_records/ANM-A').species='Sheep';assert.equal((await g.call('/animals/ANM-A/invoice-preview')).status,409);assert.equal((await g.call('/animals/ANM-A/invoice','billing',bill)).status,409);assert.equal([...g.rows.keys()].filter(k=>k.startsWith('invoices/')).length,0);
});
test('Inspector candidate/staff pagination is bounded, account-bound and excludes foreign identities',async t=>{
 const f=await fixture(t);for(let i=0;i<30;i++)f.rows.set('mobile_memberships/SYNTH-'+String(i).padStart(2,'0'),{role:'staff',status:'active',municipalScopeId:'SCOPE',staffPermissions:['delivery']});
 const first=await f.call('/delivery-staff','inspector');assert.equal(first.status,200);assert.equal(first.body.items.length,25);assert.ok(first.body.nextCursor);assert.ok(!first.body.items.some(x=>x.uid==='otherDelivery'));
 assert.equal((await f.call('/delivery-staff?cursor='+encodeURIComponent(first.body.nextCursor),'billing')).status,403);assert.equal((await f.call('/assignment-candidates?cursor='+encodeURIComponent(first.body.nextCursor),'inspector')).status,400);assert.equal((await f.call('/delivery-staff?scope=OTHER','inspector')).status,400);
 const rest=await f.call('/delivery-staff?cursor='+encodeURIComponent(first.body.nextCursor),'inspector');assert.equal(rest.status,200);assert.ok(rest.body.items.length<=25);assert.ok(rest.body.items.every(x=>!first.body.items.some(y=>x.uid===y.uid)));
 f.rows.set('managed_accounts/SYNTH-00',{uid:'SYNTH-00',role:'staff',status:'active',municipalScopeId:'OTHER',fullName:'Private foreign name'});const blocked=await f.call('/delivery-staff','inspector');assert.equal(blocked.status,503);assert.ok(!JSON.stringify(blocked.body).includes('Private foreign name'));
});
test('AINV internal bill reference cannot substitute for separate paper official-receipt number; rates ignore weight',async t=>{
 const f=await fixture(t);f.rows.get('animal_records/ANM-A').carcassWeight.weightGrams=50001;f.rows.get('animal_records/ANM-B').carcassWeight.weightGrams=75001;
 const a=(await f.call('/animals/ANM-A/invoice','billing',bill)).body,b=(await f.call('/animals/ANM-B/invoice','billing',bill)).body;assert.equal(a.total_amount,95);assert.equal(b.total_amount,95);assert.notEqual(a.id,b.id);
 const before=structuredClone(f.rows.get('invoices/'+a.id));assert.equal((await f.call('/invoices/'+a.id+'/payment','billing',{...payment(1),receiptReference:a.id})).status,400);assert.deepEqual(f.rows.get('invoices/'+a.id),before);
 const paid=await f.call('/invoices/'+a.id+'/payment','billing',{...payment(1),receiptReference:'PAPER-OR-TEST-001'});assert.equal(paid.status,200);assert.equal(paid.body.id,a.id);assert.equal(paid.body.payment.receiptReference,'PAPER-OR-TEST-001');assert.equal(paid.body.payment.amountCents,9500);
});

 test('Inspector assignment requires an explicit current owning-Vendor choice, without changing fees or measurement',async t=>{
 const f=await fixture(t);const inv=(await f.call('/animals/ANM-A/invoice','billing',bill)).body;
 const path=`/invoices/${inv.id}/delivery`,body={expectedRevision:1,assigneeUid:'delivery',destinationConfirmed:true,destination:'Synthetic market / Section A / Stall 1'};
 const stored=f.rows.get('animal_organ_choices/ANM-A');f.rows.delete('animal_organ_choices/ANM-A');
 const preview=await f.call(`/invoices/${inv.id}/assignment-options`,'inspector');assert.equal(preview.status,409);assert.match(preview.body.message,/explicitly choose/);const rejected=await f.call(path,'inspector',body);assert.equal(rejected.status,409);assert.equal(f.rows.get(`invoices/${inv.id}`).delivery,undefined);
 for(const patch of [{choice:null},{choice:'decline',animalRevision:2},{choice:'collect',vendorBusinessId:'VEN-B'},{choice:'collect',municipalScopeId:'OTHER'}]){f.rows.set('animal_organ_choices/ANM-A',{...stored,...patch});assert.equal((await f.call(`/invoices/${inv.id}/assignment-options`,'inspector')).status,409);}
 f.rows.set('animal_organ_choices/ANM-A',{...stored,choice:'decline'});const ready=await f.call(`/invoices/${inv.id}/assignment-options`,'inspector');assert.equal(ready.status,200);const assigned=await f.call(path,'inspector',{...body,destination:ready.body.destination});assert.equal(assigned.status,200);assert.equal(f.rows.get(`invoices/${inv.id}`).totalCents,9500);assert.equal(f.rows.get('animal_records/ANM-A').carcassWeight.weightGrams,60000);
 });
