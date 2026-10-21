import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createOperationsStore, createOperationsRouter, syntheticOperationsEnabled, operationBillingView } from './operations.js';
import { createAnimalMobileAuth } from './animals.js';

const fees={status:'approved',version:1,basis:'perAnimal',currency:'PHP',corralCents:1500,deliveryCents:2500,inspectionCents:1000,facilityCents:4500,syntheticOnly:true};
const bill={expectedRevision:1,feeScheduleVersion:1,dueDate:'2099-01-01'};
const payment=revision=>({expectedRevision:revision,amountCents:9500,receiptReference:'TEST-RECEIPT',method:'cash'});
test('feature flag cannot enable the new workflows on a live project or remote emulator host',()=>{
  const env={ANIMAL_OPERATIONS_ENABLED:'true',GCLOUD_PROJECT:'demo-test',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9199',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8180'};
  assert.equal(syntheticOperationsEnabled(env,'demo-test'),true);
  assert.equal(syntheticOperationsEnabled(env,'municipal-live'),false);
  assert.equal(syntheticOperationsEnabled({...env,FIRESTORE_EMULATOR_HOST:'remote.example:8180'},'demo-test'),false);
  assert.equal(syntheticOperationsEnabled({...env,GCLOUD_PROJECT:'municipal-live'},'demo-test'),false);
  assert.equal(syntheticOperationsEnabled({...env,FIREBASE_AUTH_EMULATOR_HOST:undefined},'demo-test'),false);
  assert.equal(syntheticOperationsEnabled({...env,ANIMAL_OPERATIONS_ENABLED:'false'},'demo-test'),false);
});
async function fixture(t,enabled=true,now=()=>new Date().toISOString(),production=null) {
  const rows=new Map();let sequence=0,queue=Promise.resolve();
  const snap=ref=>({exists:rows.has(ref.path),id:ref.path.split('/').at(-1),data:()=>structuredClone(rows.get(ref.path))});
  const doc=path=>({path,get:async()=>snap({path})});
  const db={doc,collection:path=>({doc:()=>doc(`${path}/EVENT-${++sequence}`),where(field,op,value){const filters=[[field,op,value]];const q={where:(f,o,v)=>{filters.push([f,o,v]);return q;},orderBy:()=>q,startAfter:value=>{q.after=value;return q;},limit:n=>{q.limit=n;return q;},get:async()=>({docs:[...rows].filter(([key,row])=>key.startsWith(path+'/')&&filters.every(([f,o,v])=>{const actual=f.split('.').reduce((r,k)=>r?.[k],row);return o==='in'?v.includes(actual):actual===v;})&&(!q.after||key.split('/').at(-1)>q.after)).sort(([a],[b])=>a<b?-1:1).slice(0,q.limit).map(([path])=>snap({path}))})};return q;}}),runTransaction(fn){const result=queue.then(async()=>{const writes=[];const tx={get:async ref=>snap(ref),create:(ref,row)=>{if(rows.has(ref.path))throw Error('Already exists');writes.push([ref.path,row]);},set:(ref,row)=>writes.push([ref.path,row]),update:(ref,patch)=>writes.push([ref.path,{...rows.get(ref.path),...patch}])};const value=await fn(tx);for(const [path,row] of writes)rows.set(path,structuredClone(row));return value;});queue=result.catch(()=>{});return result;}};
  const memberships={billing:{role:'staff',staffPermissions:['billing']},delivery:{role:'staff',staffPermissions:['delivery']},delivery2:{role:'staff',staffPermissions:['delivery']},multi:{role:'staff',staffPermissions:['billing','delivery']},inventory:{role:'staff',staffPermissions:['inventory']},inspector:{role:'inspector'},alice:{role:'vendor',vendorBusinessId:'VEN-A'},bob:{role:'vendor',vendorBusinessId:'VEN-B'},other:{role:'staff',staffPermissions:['billing'],municipalScopeId:'OTHER'},otherDelivery:{role:'staff',staffPermissions:['delivery'],municipalScopeId:'OTHER'}};
  for(const [uid,m] of Object.entries(memberships)){m.status='active';m.municipalScopeId??='SCOPE';rows.set(`mobile_memberships/${uid}`,m);}
  for(const value of ['A','B'])rows.set(`vendors/VEN-${value}`,{id:`VEN-${value}`,name:`Synthetic ${value}`,status:'Active',municipalScopeId:'SCOPE'});
  rows.set('operation_fee_schedules/SCOPE',structuredClone(fees));
  for(const value of ['A','B'])rows.set(`animal_records/ANM-${value}`,{id:`ANM-${value}`,vendorBusinessId:'VEN-A',municipalScopeId:'SCOPE',revision:1,inspection:{status:'approved',revision:1},species:'Pig',weightGrams:85001,identifier:`TEST-${value}`});
  const auth={verifyIdToken:async token=>{if(token==='expired')throw {code:'auth/id-token-expired'};return {uid:token,email_verified:true,municipalRole:memberships[token]?.role,municipalScopeId:memberships[token]?.municipalScopeId};}};
  const animalStore={get:async value=>rows.get('animal_records/'+value)??null,membership:async uid=>memberships[uid],vendor:async value=>rows.get(`vendors/${value}`),list:async p=>[...rows].filter(([key,row])=>key.startsWith('animal_records/')&&row.municipalScopeId===p.municipalScopeId).map(([,row])=>row)};
  const store=createOperationsStore(()=>db,{production:Boolean(production)}),app=express();
  app.use(express.json());app.use('/api/mobile/operations',createAnimalMobileAuth(()=>auth,animalStore),createOperationsRouter({store,animalStore,enabled,now,production,cursorSecret:Buffer.alloc(32,1),getPrincipal:req=>req.animalUser}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const call=async(path,who='billing',body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/mobile/operations${path}`,{method:body?'POST':'GET',headers:{...(who?{Authorization:`Bearer ${who}`} : {}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
  return {rows,memberships,call,store};
}
async function inTransit(f){const inv=(await f.call('/animals/ANM-A/invoice','billing',bill)).body;await f.call(`/invoices/${inv.id}/payment`,'billing',payment(1));await f.call(`/invoices/${inv.id}/delivery`,'delivery',{expectedRevision:2,assigneeUid:'delivery',destination:'Synthetic market'});await f.call(`/invoices/${inv.id}/delivery/status`,'delivery',{expectedRevision:3,status:'in_transit',notes:'Departed'});return inv.id;}

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
  assert.equal(own.status,200);assert.equal(own.body.trackingState,'completed');assert.equal(own.body.location.latitude,13.96);
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
test('delivery requires payment and active assignment; only assignee advances ordered statuses',async t=>{
  const {call,memberships}=await fixture(t);const inv=(await call('/animals/ANM-A/invoice','billing',bill)).body;
  const assign={expectedRevision:1,assigneeUid:'delivery',destination:'Synthetic Calauag market'};
  assert.equal((await call(`/invoices/${inv.id}/delivery`,'delivery',assign)).status,409);
  await call(`/invoices/${inv.id}/payment`,'billing',payment(1));assign.expectedRevision=2;
  memberships.delivery2.status='pending';assert.equal((await call(`/invoices/${inv.id}/delivery`,'delivery',{...assign,assigneeUid:'delivery2'})).status,400);memberships.delivery2.status='active';
  const assigned=await call(`/invoices/${inv.id}/delivery`,'delivery',assign);assert.equal(assigned.status,200);assert.equal(assigned.body.delivery.status,'assigned');
  assert.equal((await call(`/invoices/${inv.id}/delivery/status`,'delivery2',{expectedRevision:3,status:'in_transit',notes:'Test departure'})).status,403);
  assert.equal((await call(`/invoices/${inv.id}/delivery/status`,'delivery',{expectedRevision:3,status:'delivered',notes:'Test arrival'})).status,409);
  assert.equal((await call(`/invoices/${inv.id}/delivery/status`,'delivery',{expectedRevision:3,status:'in_transit',notes:'Test departure'})).status,200);
  assert.equal((await call(`/invoices/${inv.id}/delivery/status`,'delivery',{expectedRevision:4,status:'delivered',notes:'Test arrival'})).status,200);
  assert.equal((await call(`/invoices/${inv.id}/delivery/status`,'delivery',{expectedRevision:5,status:'in_transit',notes:'Test repeat'})).status,409);
});
test('delivery location validates fresh coordinates, assignment and permission removal',async t=>{
  const {call,memberships}=await fixture(t);const inv=(await call('/animals/ANM-A/invoice','billing',bill)).body;
  await call(`/invoices/${inv.id}/payment`,'billing',payment(1));await call(`/invoices/${inv.id}/delivery`,'delivery',{expectedRevision:2,assigneeUid:'delivery',destination:'Synthetic market'});
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
 await f.call(`/invoices/${other.id}/delivery`,'delivery',{expectedRevision:2,assigneeUid:'delivery2',destination:'Recorded destination B'});
 for(const a of ['A','B'])Object.assign(f.rows.get('animal_records/ANM-'+a),{weighedAt:'2026-10-20T01:00:00.000Z',inspection:{status:'approved',revision:1,notes:'PRIVATE INSPECTION',inspectorUid:'private-inspector'}});
 const list=await f.call('/deliveries','delivery');assert.equal(list.status,200);assert.deepEqual(list.body.items.map(x=>x.id),[own]);
 const item=list.body.items[0];assert.equal(item.projection,'delivery_assignment_v1');assert.equal(item.meatDetails.species,'Pig');assert.equal(item.meatDetails.carcassEstimate.weightGrams,68001);assert.equal(item.meatDetails.carcassWeight,null);
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
