import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createOperationsStore, createOperationsRouter, syntheticOperationsEnabled } from './operations.js';
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
async function fixture(t,enabled=true) {
  const rows=new Map();let sequence=0,queue=Promise.resolve();
  const snap=ref=>({exists:rows.has(ref.path),id:ref.path.split('/').at(-1),data:()=>structuredClone(rows.get(ref.path))});
  const doc=path=>({path,get:async()=>snap({path})});
  const db={doc,collection:path=>({doc:()=>doc(`${path}/EVENT-${++sequence}`),where(field,op,value){const filters=[[field,value]];const q={where:(f,o,v)=>{filters.push([f,v]);return q;},orderBy:()=>q,startAfter:value=>{q.after=value;return q;},limit:n=>{q.limit=n;return q;},get:async()=>({docs:[...rows].filter(([key,row])=>key.startsWith(path+'/')&&filters.every(([f,v])=>row[f]===v)&&(!q.after||key.split('/').at(-1)>q.after)).sort(([a],[b])=>a<b?-1:1).slice(0,q.limit).map(([path])=>snap({path}))})};return q;}}),runTransaction(fn){const result=queue.then(async()=>{const writes=[];const tx={get:async ref=>snap(ref),create:(ref,row)=>{if(rows.has(ref.path))throw Error('Already exists');writes.push([ref.path,row]);},set:(ref,row)=>writes.push([ref.path,row]),update:(ref,patch)=>writes.push([ref.path,{...rows.get(ref.path),...patch}])};const value=await fn(tx);for(const [path,row] of writes)rows.set(path,structuredClone(row));return value;});queue=result.catch(()=>{});return result;}};
  const memberships={billing:{role:'staff',staffPermissions:['billing']},delivery:{role:'staff',staffPermissions:['delivery']},delivery2:{role:'staff',staffPermissions:['delivery']},inventory:{role:'staff',staffPermissions:['inventory']},inspector:{role:'inspector'},alice:{role:'vendor',vendorBusinessId:'VEN-A'},bob:{role:'vendor',vendorBusinessId:'VEN-B'},other:{role:'staff',staffPermissions:['billing'],municipalScopeId:'OTHER'}};
  for(const [uid,m] of Object.entries(memberships)){m.status='active';m.municipalScopeId??='SCOPE';rows.set(`mobile_memberships/${uid}`,m);}
  for(const value of ['A','B'])rows.set(`vendors/VEN-${value}`,{id:`VEN-${value}`,name:`Synthetic ${value}`,status:'Active',municipalScopeId:'SCOPE'});
  rows.set('operation_fee_schedules/SCOPE',structuredClone(fees));
  for(const value of ['A','B'])rows.set(`animal_records/ANM-${value}`,{id:`ANM-${value}`,vendorBusinessId:'VEN-A',municipalScopeId:'SCOPE',revision:1,inspection:{status:'approved',revision:1},species:'Pig',weightGrams:85001,identifier:`TEST-${value}`});
  const auth={verifyIdToken:async token=>{if(token==='expired')throw {code:'auth/id-token-expired'};return {uid:token,municipalRole:memberships[token]?.role,municipalScopeId:memberships[token]?.municipalScopeId};}};
  const animalStore={membership:async uid=>memberships[uid],vendor:async value=>rows.get(`vendors/${value}`),list:async p=>[...rows].filter(([key,row])=>key.startsWith('animal_records/')&&row.municipalScopeId===p.municipalScopeId).map(([,row])=>row)};
  const store=createOperationsStore(()=>db),app=express();
  app.use(express.json());app.use('/api/mobile/operations',createAnimalMobileAuth(()=>auth,animalStore),createOperationsRouter({store,animalStore,enabled,getPrincipal:req=>req.animalUser}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const call=async(path,who='billing',body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/mobile/operations${path}`,{method:body?'POST':'GET',headers:{...(who?{Authorization:`Bearer ${who}`} : {}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
  return {rows,memberships,call};
}
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
