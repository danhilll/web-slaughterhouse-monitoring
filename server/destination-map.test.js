import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,bill,payment} from './test-support/operations-fixture.js';
const pin={latitude:1.25,longitude:2.5,expectedRevision:1,expectedDestinationRevision:0,verificationReference:'SYNTHETIC INSPECTOR TEST ONLY',confirmed:true,expectedDestination:{vendorBusinessId:'VEN-A',marketName:'Synthetic Market',marketSection:'Meat',stallNumber:'A'}};
async function issued(t){const f=await fixture(t);const inv=await f.call('/animals/ANM-A/invoice','billing',bill);assert.equal(inv.status,201);return {...f,id:inv.body.id,path:`/invoices/${inv.body.id}/destination-map`};}
const assign=(f,revision=1)=>f.call(`/invoices/${f.id}/delivery`,'inspector',{expectedRevision:revision,assigneeUid:'delivery',destination:'Synthetic Market / Meat / Stall A',destinationConfirmed:true,expectedDestination:pin.expectedDestination,expectedDestinationRevision:f.rows.get('delivery_destination_pins/'+f.id)?.revision??0});
test('Inspector pin validation, authority, scope, confirmation and audit preserve original financial/animal records',async t=>{
 const f=await issued(t),original=structuredClone(f.rows.get('invoices/'+f.id)),animal=structuredClone(f.rows.get('animal_records/ANM-A'));
 for(const who of ['billing','inventory','alice','bob','delivery','other'])assert.equal((await f.call(f.path,who,pin)).status,who==='other'?403:403);
 assert.equal((await f.webCall(f.path,pin)).status,403);
 for(const patch of [{confirmed:false},{confirmed:undefined},{latitude:91},{longitude:181},{latitude:'1.25'},{latitude:null},{verificationReference:''},{verificationReference:'bad\nref'},{expectedDestinationRevision:-1},{expectedRevision:0},{token:'no'}])assert.equal((await f.call(f.path,'inspector',{...pin,...patch})).status,400);
 assert.equal((await f.call(f.path,'delivery')).status,404);assert.equal((await f.call(f.path,'bob')).status,404);
 const empty=await f.call(f.path,'alice');assert.equal(empty.body.status,'unavailable');assert.equal(empty.body.destination,null);
 const saved=await f.call(f.path,'inspector',pin);assert.equal(saved.status,200);assert.equal(saved.body.revision,1);assert.equal(saved.body.projection,'verified_destination_v1');assert.deepEqual(Object.keys(saved.body).sort(),['destination','invoiceId','projection','revision','status']);
 assert.deepEqual((await f.webCall(f.path)).body,saved.body);assert.deepEqual((await f.call(f.path,'alice')).body,saved.body);assert.equal('verifiedBy' in saved.body.destination,false);
 assert.deepEqual(f.rows.get('invoices/'+f.id),original);assert.deepEqual(f.rows.get('animal_records/ANM-A'),animal);
 const audit=[...f.rows].find(([p])=>p.startsWith('destination_pin_audit/'))[1];assert.equal(audit.actorUid,'inspector');assert.equal(audit.before,null);assert.equal(audit.after.verificationReference,pin.verificationReference);
 assert.equal((await f.call(f.path,'inspector',pin)).status,409);assert.equal((await f.call(f.path,'inspector',{...pin,expectedDestinationRevision:1})).status,400);
 assert.equal((await f.call(f.path,'inspector',{...pin,latitude:0,longitude:0,expectedDestinationRevision:1,reason:'Corrected synthetic pin'})).status,200);assert.equal([...f.rows].filter(([p])=>p.startsWith('destination_pin_audit/')).length,2);
});
test('connected invoice→verified pin→unpaid Inspector assignment→tracking→cash→completion preserves snapshots and isolates readers',async t=>{
 let now=new Date().toISOString();const f=await fixture(t,true,()=>now);const inv=(await f.call('/animals/ANM-A/invoice','billing',bill)).body;f.id=inv.id;f.path=`/invoices/${inv.id}/destination-map`;
 assert.equal((await f.call(f.path,'inspector',pin)).status,200);assert.equal((await assign(f)).status,200);
 const publicPin=await f.call(f.path,'delivery');assert.equal(publicPin.status,200);assert.equal(publicPin.body.status,'verified');assert.equal((await f.call(f.path,'delivery2')).status,404);assert.equal((await f.call(f.path,'bob')).status,404);assert.equal((await f.call(f.path,'billing')).status,404);
 assert.equal((await f.call(f.path,'inspector',{...pin,expectedRevision:2,expectedDestinationRevision:1,reason:'No'})).status,409);
 const before=structuredClone(publicPin.body);f.rows.get('vendors/VEN-A').stallNumber='CHANGED';assert.deepEqual((await f.call(f.path,'alice')).body,before,'assigned pin never follows a moved Vendor');
 assert.equal((await f.call(`/invoices/${inv.id}/delivery/status`,'delivery',{expectedRevision:2,status:'in_transit',notes:'Synthetic departure'})).status,200);
 const pos={latitude:3.25,longitude:4.5,accuracyMeters:12,capturedAt:now};assert.equal((await f.call(`/invoices/${inv.id}/tracking`,'delivery',pos)).status,200);
 let v=await f.webCall(`/oversight/invoices/${inv.id}`);assert.equal(v.status,200);assert.equal(v.body.invoice.balanceCents,9500);assert.equal(v.body.invoice.payment_status,'Unpaid');assert.equal(v.body.assignment.delivery.status,'in_transit');assert.equal(v.body.tracking.location.latitude,pos.latitude);
 const storedSnapshot=structuredClone(f.rows.get('invoices/'+inv.id).feeScheduleSnapshot);assert.equal((await f.call(`/invoices/${inv.id}/payment`,'billing',{...payment(3),receiptReference:'SYNTHETIC-PAPER-OR'})).status,200);
 v=await f.webCall(`/oversight/invoices/${inv.id}`);assert.equal(v.body.invoice.id,inv.id);assert.equal(v.body.invoice.payment.receiptReference,'SYNTHETIC-PAPER-OR');assert.equal(v.body.invoice.balanceCents,0);assert.deepEqual(v.body.invoice.feeScheduleSnapshot,storedSnapshot);
 now=new Date(Date.parse(now)+46000).toISOString();assert.equal((await f.call(`/invoices/${inv.id}/tracking`,'alice')).body.trackingState,'stale');
 assert.equal((await f.call(`/invoices/${inv.id}/delivery/status`,'delivery',{expectedRevision:4,status:'delivered',notes:'Synthetic completed'})).status,200);assert.equal((await f.call(`/invoices/${inv.id}/tracking`,'delivery',{...pos,capturedAt:now})).status,409);assert.equal((await f.call(`/invoices/${inv.id}/tracking`,'alice')).body.trackingState,'completed');assert.equal((await f.call(`/invoices/${inv.id}/tracking`,'bob')).status,404);
});
test('missing/stale pin remains text-only; malformed coordinates fail visibly; v9 response shapes unchanged',async t=>{
 const f=await issued(t);assert.equal((await assign(f)).status,200);assert.equal((await f.call(f.path,'delivery')).body.status,'unavailable');
 const g=await issued(t);await g.call(g.path,'inspector',pin);g.rows.get('vendors/VEN-A').marketSection='NEW SECTION';const stale=await g.call(g.path,'inspector');assert.equal(stale.body.status,'unavailable');assert.equal(stale.body.destination,null);assert.equal(stale.body.revision,1);
 g.rows.get('delivery_destination_pins/'+g.id).latitude=Infinity;assert.equal((await g.call(g.path,'inspector')).status,503);
 const row=(await f.call(`/invoices/${f.id}`,'alice')).body;assert.equal('destinationPin' in row.delivery,false);const delivery=(await f.call(`/deliveries/${f.id}`,'delivery')).body;assert.equal('destinationPin' in delivery.delivery,false);
});
test('concurrent destination confirmations have one winner and only one atomic audit',async t=>{
 const f=await issued(t);const result=await Promise.all([f.call(f.path,'inspector',pin),f.call(f.path,'inspector',{...pin,latitude:5})]);assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);assert.equal([...f.rows].filter(([p])=>p.startsWith('destination_pin_audit/')).length,1);
});

test('failed pin audit and paused delivery gate preserve all stored data and deny mutation',async t=>{
 const f=await issued(t);f.state.failDestinationAudit=true;const before=structuredClone([...f.rows]);assert.equal((await f.call(f.path,'inspector',pin)).status,503);assert.deepEqual([...f.rows],before);
 const off=await fixture(t,true,()=>new Date().toISOString(),{municipalScopeId:'SCOPE',features:{billing:false,delivery:false,payment:false,tracking:false}});off.rows.set('invoices/PAUSED',f.rows.get('invoices/'+f.id));assert.equal((await off.call('/invoices/PAUSED/destination-map','inspector',pin)).status,503);assert.equal([...off.rows].some(([p])=>p.startsWith('destination_pin_audit/')),false);
});

test('reviewed Vendor/stall tuple is rechecked atomically even when different tuples share the same joined destination text',async t=>{
 const f=await issued(t);const vendor=f.rows.get('vendors/VEN-A');const {stallReservationKey}=await import('./owner-workflow-policy.js');
 const reserve=()=>f.rows.set('market_stall_assignments/'+stallReservationKey(vendor),{vendorBusinessId:'VEN-A',municipalScopeId:'SCOPE',marketName:vendor.marketName,marketSection:vendor.marketSection,stallNumber:vendor.stallNumber});
 Object.assign(vendor,{marketName:'Synthetic X',marketSection:'Y / Z'});reserve();const reviewed=(await f.call(`/invoices/${f.id}/assignment-options`,'inspector')).body;
 Object.assign(vendor,{marketName:'Synthetic X / Y',marketSection:'Z'});reserve();const current=(await f.call(`/invoices/${f.id}/assignment-options`,'inspector')).body;assert.equal(reviewed.destination,current.destination,'joined label alone is insufficient');
 const tuple=o=>({vendorBusinessId:o.vendorBusinessId,marketName:o.marketName,marketSection:o.marketSection,stallNumber:o.stallNumber});const before=structuredClone([...f.rows]);assert.equal((await f.call(f.path,'inspector',{...pin,expectedDestination:tuple(reviewed)})).status,409);assert.deepEqual([...f.rows],before);
 assert.equal((await f.call(f.path,'inspector',{...pin,expectedDestination:tuple(current)})).status,200);
});

test('assignment rechecks reviewed pin revision and tuple; legacy text-only remains compatible',async t=>{
 const f=await issued(t);await f.call(f.path,'inspector',pin);const body={expectedRevision:1,assigneeUid:'delivery',destination:'Synthetic Market / Meat / Stall A',destinationConfirmed:true,expectedDestination:pin.expectedDestination,expectedDestinationRevision:1};
 await f.call(f.path,'inspector',{...pin,expectedDestinationRevision:1,latitude:5,reason:'Synthetic corrected pin'});
 assert.equal((await f.call(`/invoices/${f.id}/delivery`,'inspector',body)).status,409);
 const legacy={...body};delete legacy.expectedDestination;delete legacy.expectedDestinationRevision;assert.equal((await f.call(`/invoices/${f.id}/delivery`,'inspector',legacy)).status,409);
 assert.equal((await f.call(`/invoices/${f.id}/delivery`,'inspector',{...body,expectedDestinationRevision:2})).status,200);
});
