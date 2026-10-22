import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,bill} from './test-support/operations-fixture.js';
const select={latitude:1.25,longitude:2.5,expectedRevision:2,expectedDropOffRevision:0,selectionMethod:'map_tap',confirmed:true};
async function assigned(t,production=null){const f=await fixture(t,true,()=>new Date().toISOString(),production);const inv=await f.call('/animals/ANM-A/invoice','billing',bill);assert.equal(inv.status,201);const id=inv.body.id;assert.equal((await f.call(`/invoices/${id}/delivery`,'inspector',{expectedRevision:1,assigneeUid:'delivery',destination:'Synthetic Market / Meat / Stall A',destinationConfirmed:true})).status,200);return {...f,id,path:`/invoices/${id}/drop-off-point`};}
test('optional drop-off reads/writes isolate exact assignee, owner and municipal admin; authority is not broadened',async t=>{
 const f=await assigned(t);assert.equal((await f.call(f.path,'delivery')).body.point,null);assert.equal((await f.call(f.path,'delivery')).body.canUpdate,true);
 for(const who of ['billing','inventory','inspector','alice','bob'])assert.equal((await f.call(f.path,who,select)).status,403);
 for(const who of ['delivery2','otherDelivery'])assert.equal((await f.call(f.path,who,select)).status,404);
 assert.equal((await f.webCall(f.path,select)).status,403);
 for(const who of ['delivery2','otherDelivery','bob','billing','inspector'])assert.equal((await f.call(f.path,who)).status,404);
 const saved=await f.call(f.path,'delivery',select);assert.equal(saved.status,200);assert.deepEqual(Object.keys(saved.body).sort(),['canUpdate','invoiceId','invoiceRevision','point','projection','revision']);assert.equal(saved.body.projection,'delivery_drop_off_v1');assert.equal(saved.body.invoiceRevision,2);assert.equal(saved.body.revision,1);assert.deepEqual(Object.keys(saved.body.point).sort(),['latitude','longitude','selectedAt','selectionMethod']);
 for(const response of [await f.call(f.path,'alice'),await f.webCall(f.path)]){assert.equal(response.status,200);assert.deepEqual(response.body.point,saved.body.point);assert.equal(response.body.canUpdate,false);}
 f.memberships.delivery.staffPermissions=['inventory','billing','delivery'];assert.equal((await f.call(f.path,'delivery',{...select,expectedDropOffRevision:1,selectionMethod:'device_location'})).status,200);
});
test('coordinates, explicit confirmation, method, query and both revisions fail closed without writes',async t=>{
 const f=await assigned(t),before=structuredClone([...f.rows]);
 for(const patch of [{latitude:'1'},{latitude:null},{latitude:91},{longitude:-181},{expectedDropOffRevision:-1},{expectedDropOffRevision:undefined},{expectedRevision:0},{confirmed:false},{confirmed:undefined},{selectionMethod:'last_shared'},{selectedAt:new Date().toISOString()},{token:'x'}])assert.equal((await f.call(f.path,'delivery',{...select,...patch})).status,400);
 assert.equal((await f.call(f.path+'?token=x','delivery',select)).status,400);assert.equal((await f.call(f.path+'?x=1','delivery')).status,400);assert.equal((await f.call(f.path,'delivery',{...select,expectedRevision:1})).status,409);assert.deepEqual([...f.rows],before);
 assert.equal((await f.call(f.path,'delivery',{...select,latitude:-90,longitude:180})).status,200);
 const saved=structuredClone([...f.rows]);assert.equal((await f.call(f.path,'delivery',select)).status,409);assert.deepEqual([...f.rows],saved);
});
test('independent pin changes audit original values and never alter Inspector destination, tracking, invoice or animal',async t=>{
 const f=await assigned(t),invoice=structuredClone(f.rows.get('invoices/'+f.id)),animal=structuredClone(f.rows.get('animal_records/ANM-A'));
 assert.equal((await f.call(f.path,'delivery',select)).status,200);assert.equal((await f.call(f.path,'delivery',{...select,expectedDropOffRevision:1,latitude:3.25,selectionMethod:'device_location'})).status,200);
 assert.deepEqual(f.rows.get('invoices/'+f.id),invoice);assert.deepEqual(f.rows.get('animal_records/ANM-A'),animal);assert.equal([...f.rows].some(([p])=>p.startsWith('delivery_destination_pins/')),false);
 const audit=[...f.rows].filter(([p])=>p.startsWith('delivery_drop_off_audit/')).map(([,r])=>r);assert.equal(audit.length,2);assert.equal(audit[0].before,null);assert.equal(audit[1].before.latitude,1.25);assert.equal(audit[1].after.latitude,3.25);assert.equal(audit[1].actorUid,'delivery');assert.equal(audit[1].at,audit[1].after.selectedAt);
 const legacy=(await f.call(`/deliveries/${f.id}`,'delivery')).body;assert.equal('dropOff' in legacy,false);assert.equal('dropOffPoint' in legacy.delivery,false);
});
test('missing point never blocks unpaid dispatch/completion; retained point rejects updates after completion',async t=>{
 const f=await assigned(t);assert.equal((await f.call(`/invoices/${f.id}/delivery/status`,'delivery',{expectedRevision:2,status:'in_transit',notes:'Synthetic departure'})).status,200);
 assert.equal((await f.call(f.path,'delivery',{...select,expectedRevision:3})).status,200);
 assert.equal((await f.call(`/invoices/${f.id}/delivery/status`,'delivery',{expectedRevision:3,status:'delivered',notes:'Synthetic completion'})).status,200);const before=structuredClone([...f.rows]);
 assert.equal((await f.call(f.path,'delivery',{...select,expectedRevision:4,expectedDropOffRevision:1})).status,409);assert.deepEqual([...f.rows],before);assert.equal((await f.call(f.path,'delivery')).body.canUpdate,false);assert.notEqual((await f.call(f.path,'alice')).body.point,null);
 const g=await assigned(t);assert.equal((await g.call(`/invoices/${g.id}/delivery/status`,'delivery',{expectedRevision:2,status:'in_transit',notes:'No optional point'})).status,200);assert.equal((await g.call(`/invoices/${g.id}/delivery/status`,'delivery',{expectedRevision:3,status:'delivered',notes:'No optional point'})).status,200);
});
test('concurrent changes have one winner; audit failure is atomic; paused delivery gate denies only writes',async t=>{
 const f=await assigned(t),before=structuredClone([...f.rows]);f.state.failDropOffAudit=true;assert.equal((await f.call(f.path,'delivery',select)).status,503);assert.deepEqual([...f.rows],before);f.state.failDropOffAudit=false;
 const result=await Promise.all([f.call(f.path,'delivery',select),f.call(f.path,'delivery',{...select,latitude:5})]);assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);assert.equal([...f.rows].filter(([p])=>p.startsWith('delivery_drop_off_audit/')).length,1);
 const off=await fixture(t,true,()=>new Date().toISOString(),{municipalScopeId:'SCOPE',features:{delivery:false}});off.rows.set('invoices/'+f.id,f.rows.get('invoices/'+f.id));assert.equal((await off.call(f.path,'delivery',select)).status,503);assert.equal((await off.call(f.path,'delivery')).body.canUpdate,false);
 f.rows.get('delivery_drop_off_points/'+f.id).latitude=NaN;assert.equal((await f.call(f.path,'alice')).status,503);
});
