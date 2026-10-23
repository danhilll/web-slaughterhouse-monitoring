import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './test-support/operations-fixture.js';

// One chained, isolated run of the agreed pilot flow on shared synthetic state: real animals and operations routers.
const scenarios=[
  {species:'Pig',identifier:'PILOT-PIG-1',live:85001,scale:null,method:'calculated_80_percent',carcass:68001},
  {species:'Cow',identifier:'PILOT-COW-1',live:150000,scale:119001,method:'measured',carcass:119001}];
for(const sc of scenarios)test(`pilot flow (${sc.method}): register → approve → carcass basis → organ choice → PHP95 invoice → assign → unpaid dispatch → drop-off → tracking → completion → cash → oversight`,async t=>{
  const f=await fixture(t);
  const animals=async(path,who,body)=>{const r=await fetch(`${f.origin}/api/mobile/animals${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${who}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
  const hoursAgo=h=>new Date(Date.now()-h*3600000).toISOString();
  const dueDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

  // 1. Registration to the validated owning Vendor; only inventory Staff may register.
  const input={vendorBusinessId:'VEN-A',identifier:sc.identifier,identifierType:'manual',species:sc.species,weightGrams:sc.live,weighedAt:hoursAgo(2)};
  assert.equal((await animals('/','billing',input)).status,403);
  assert.equal((await animals('/','inventory',{...input,vendorBusinessId:'VEN-MISSING'})).status>=400,true);
  const created=await animals('/','inventory',input);assert.equal(created.status,201);
  const animalId=created.body.id;assert.equal(created.body.vendorBusinessId,'VEN-A');
  const preview=()=>f.call(`/animals/${animalId}/invoice-preview`,'billing');

  // 2–3. Unapproved animals cannot be priced; only the Inspector approves the current revision.
  assert.equal((await preview()).status,409);
  assert.equal((await animals(`/${animalId}/inspection`,'inventory',{decision:'approved',expectedRevision:1,notes:'Synthetic review'})).status,403);
  assert.equal((await animals(`/${animalId}/inspection`,'inspector',{decision:'approved',expectedRevision:1,notes:'Synthetic ownership and weight review'})).status,200);

  // 3. Carcass basis: calculated (live weight x 0.8) by default; a scale reading, when recorded, is kept and distinct.
  assert.equal(created.body.carcassWeight,null);assert.equal(created.body.carcassEstimate.weightGrams,Math.round(sc.live*0.8));
  if(sc.scale){
    assert.equal((await animals(`/${animalId}/carcass-weight`,'billing',{weightGrams:sc.scale,weighedAt:hoursAgo(1),expectedRevision:1,expectedCarcassRevision:0})).status,403);
    const measured=await animals(`/${animalId}/carcass-weight`,'inventory',{weightGrams:sc.scale,weighedAt:hoursAgo(1),expectedRevision:1,expectedCarcassRevision:0});
    assert.equal(measured.status,200);assert.equal(measured.body.carcassWeight.weightGrams,sc.scale);assert.equal(measured.body.carcassWeightSelection.source,'measured');
  }

  // 5. PHP95 immutable-snapshot invoice for the owning Vendor; Billing only; duplicate protected.
  const pv=await preview();assert.equal(pv.status,200);assert.equal(pv.body.totalCents,9500);assert.deepEqual(Object.keys(pv.body).sort(),['animal','currency','feeSchedule','projection','totalCents','vendor'],'preview contract unchanged for deployed clients');assert.equal(pv.body.vendor.id,'VEN-A');
  assert.equal((await f.call(`/animals/${animalId}/invoice`,'inspector',{expectedRevision:1,feeScheduleVersion:1,dueDate})).status,403);
  assert.equal((await f.webCall(`/animals/${animalId}/invoice`,{expectedRevision:1,feeScheduleVersion:1,dueDate})).status,403);
  const issued=await f.call(`/animals/${animalId}/invoice`,'billing',{expectedRevision:1,feeScheduleVersion:1,dueDate});
  assert.equal(issued.status,201);const id=issued.body.id;
  assert.match(id,/^AINV-[0-9a-f]{40}$/);assert.equal(issued.body.vendor_id,'VEN-A');assert.equal(issued.body.total_amount,95);assert.equal(issued.body.payment_status,'Unpaid');
  assert.deepEqual([issued.body.corral_fee,issued.body.delivery_fee,issued.body.anti_mortem_fee,issued.body.facility_fee],[15,25,10,45]);
  assert.equal(issued.body.due_date,dueDate);assert.equal(issued.body.feeScheduleSnapshot.version,1);
  const basis=issued.body.carcassBasis;assert.equal(basis.method,sc.method);assert.equal(basis.liveWeightGrams,sc.live);assert.equal(basis.carcassWeightGrams,sc.carcass);assert.equal(basis.animalRevision,1);
  if(sc.scale){assert.equal(basis.weighedAt!==undefined&&basis.measurementRevision===1,true);assert.equal(basis.factor,undefined);}
  else{assert.equal(basis.factor,0.8);assert.equal(basis.rule,'manager_80_percent_v1');assert.equal(basis.rounding,'nearest_gram_half_up');assert.equal(basis.weighedAt,undefined);}
  assert.equal((await f.call(`/animals/${animalId}/invoice`,'billing',{expectedRevision:1,feeScheduleVersion:1,dueDate})).status,409);

  // 4 & 6. The owning Vendor must explicitly choose; unset blocks assignment and is never read as decline.
  const unset=await animals(`/${animalId}/organ-collection`,'alice');assert.equal(unset.status,200);assert.equal(unset.body.choice,null);
  assert.equal((await f.call(`/invoices/${id}/assignment-options`,'inspector')).status,409);
  assert.equal((await animals(`/${animalId}/organ-collection`,'bob',{choice:'decline',expectedRevision:1,expectedChoiceRevision:0})).status,404);
  assert.equal((await animals(`/${animalId}/organ-collection`,'inspector',{choice:'decline',expectedRevision:1,expectedChoiceRevision:0})).status,403);
  const chosen=await animals(`/${animalId}/organ-collection`,'alice',{choice:'decline',expectedRevision:1,expectedChoiceRevision:0});
  assert.equal(chosen.status,200);assert.equal(chosen.body.choice,'decline');
  assert.equal(f.rows.get(`invoices/${id}`).total_amount,95,'organ choice never changes fees; both methods are PHP95 per animal');

  // 6. Inspector assigns active Delivery Staff against the verified owning-Vendor stall; payment is not a prerequisite.
  const options=await f.call(`/invoices/${id}/assignment-options`,'inspector');assert.equal(options.status,200);assert.equal(options.body.destination,'Synthetic Market / Meat / Stall A');
  const assign={expectedRevision:1,assigneeUid:'delivery',destination:options.body.destination,destinationConfirmed:true};
  for(const who of ['billing','delivery','alice'])assert.equal((await f.call(`/invoices/${id}/delivery`,who,assign)).status,403);
  assert.equal((await f.call(`/invoices/${id}/delivery`,'inspector',{...assign,assigneeUid:'alice'})).status,400);
  assert.equal((await f.call(`/invoices/${id}/delivery`,'inspector',assign)).status,200);
  assert.equal((await animals(`/${animalId}/organ-collection`,'alice',{choice:'collect',expectedRevision:1,expectedChoiceRevision:1})).status,409,'choice locks after assignment');
  assert.equal(f.rows.get(`invoices/${id}`).payment_status,'Unpaid');

  // 7. Only the assignee dispatches, while the invoice is still unpaid.
  assert.equal((await f.call(`/deliveries/${id}/status`,'delivery2',{expectedRevision:2,status:'in_transit',notes:'Not mine'})).status,404);
  const dispatched=await f.call(`/deliveries/${id}/status`,'delivery',{expectedRevision:2,status:'in_transit',notes:'Departed before payment'});
  assert.equal(dispatched.status,200);assert.equal(f.rows.get(`invoices/${id}`).payment_status,'Unpaid');

  // 8. Optional drop-off: absent does not block; only the active assignee edits; explicit confirmation; same point for all scoped readers.
  const drop=`/invoices/${id}/drop-off-point`;
  const none=await f.call(drop,'delivery');assert.equal(none.status,200);assert.equal(none.body.point,null);assert.equal(none.body.canUpdate,true);
  const pin={latitude:13.9601,longitude:122.2902,expectedRevision:3,expectedDropOffRevision:0,selectionMethod:'map_tap',confirmed:true};
  for(const who of ['alice','billing','inspector','delivery2'])assert.notEqual((await f.call(drop,who,pin)).status,200,who);
  assert.equal((await f.call(drop,'delivery',{...pin,confirmed:false})).status,400);
  assert.equal((await f.call(drop,'delivery',pin)).status,200);
  const seen=[(await f.call(drop,'alice')).body.point,(await f.webCall(drop)).body.point,(await f.call(drop,'delivery')).body.point];
  assert.deepEqual(seen[0],seen[1]);assert.deepEqual(seen[1],seen[2]);assert.equal(seen[0].latitude,13.9601);
  assert.equal((await f.call(drop,'bob')).status,404);assert.equal((await f.call(drop,'alice')).body.canUpdate,false);

  // 8. Foreground GPS sharing: assignee only; Vendor and municipal oversight see the retained position while in transit.
  const gps={latitude:13.96,longitude:122.29,accuracyMeters:9,capturedAt:new Date().toISOString()};
  assert.equal((await f.call(`/invoices/${id}/tracking`,'delivery2',gps)).status,403);
  assert.equal((await f.call(`/invoices/${id}/tracking`,'delivery',gps)).status,200);
  assert.equal((await f.call(`/invoices/${id}/tracking`,'alice')).body.location.latitude,13.96);
  assert.equal((await f.webCall(`/oversight/invoices/${id}`)).body.tracking.location.latitude,13.96);
  assert.equal((await f.call(`/invoices/${id}/tracking`,'bob')).status,404);

  // 9. Completion: position hidden everywhere, history retained, drop-off and GPS closed, fixed pin retained.
  const done=await f.call(`/deliveries/${id}/status`,'delivery',{expectedRevision:3,status:'delivered',notes:'Arrived'});assert.equal(done.status,200);
  for(const who of ['alice','delivery']){const r=await f.call(`/invoices/${id}/tracking`,who);assert.equal(r.body.trackingState,'completed');assert.equal(r.body.location,null,who);}
  assert.equal((await f.webCall(`/oversight/invoices/${id}`)).body.tracking.location,null);
  assert.equal((await f.call(`/invoices/${id}`,'alice')).body.delivery.location,undefined);
  assert.equal((await f.call(`/invoices/${id}/tracking`,'delivery',{...gps,capturedAt:new Date().toISOString()})).status,409);
  assert.equal((await f.call(drop,'delivery',{...pin,latitude:13.97,expectedRevision:4,expectedDropOffRevision:1})).status,409);
  const retained=await f.call(drop,'delivery');assert.equal(retained.body.point.latitude,13.9601);assert.equal(retained.body.canUpdate,false);
  assert.equal(f.rows.get(`delivery_positions/${id}`).latitude,13.96,'history retained');

  // 10. Cash is recorded by Billing only, against a separate paper receipt; AINV is not a receipt.
  const pay=(who,ref,rev=4)=>f.call(`/invoices/${id}/payment`,who,{expectedRevision:rev,amountCents:9500,receiptReference:ref,method:'cash'});
  for(const who of ['inspector','delivery','alice','inventory'])assert.equal((await pay(who,'OR-0001')).status,403,who);
  assert.equal((await f.webCall(`/invoices/${id}/payment`,{expectedRevision:4,amountCents:9500,receiptReference:'OR-0001',method:'cash'})).status,403);
  assert.equal((await pay('billing',id)).status,400);
  assert.equal((await f.call(`/invoices/${id}/payment`,'billing',{expectedRevision:4,amountCents:9400,receiptReference:'OR-0001',method:'cash'})).status,400);
  assert.equal((await pay('billing','OR-0001')).status,200);
  assert.equal((await pay('billing','OR-0002',5)).status,409,'no second payment');

  // 11. Vendor and municipal Web reconcile the same authoritative record; other Vendors see nothing.
  const vendor=await f.call(`/invoices/${id}`,'alice'),web=await f.webCall(`/oversight/invoices/${id}`);
  assert.equal(vendor.body.payment_status,'Paid');assert.equal(vendor.body.payment.receiptReference,'OR-0001');
  assert.equal(web.body.invoice.balanceCents,0);assert.equal(web.body.invoice.payment.receiptReference,'OR-0001');assert.equal(web.body.invoice.id,id);
  assert.equal(web.body.assignment.delivery.status,'delivered');assert.equal(web.body.animal.carcassWeight?.weightGrams??null,sc.scale);assert.equal(web.body.animal.carcassEstimate.weightGrams,Math.round(sc.live*0.8));assert.deepEqual(web.body.invoice.carcassBasis,basis);assert.deepEqual(vendor.body.carcassBasis,basis);assert.equal(web.body.invoice.feeScheduleSnapshot.version,1);
  assert.equal((await f.call(`/invoices/${id}`,'bob')).status,404);

  // Audit trail and locks.
  const actions=[...f.rows].filter(([k])=>k.startsWith('operation_audit/')).map(([,r])=>r.action);
  assert.deepEqual(actions,['invoice_issued','delivery_assigned','delivery_status','delivery_status','payment_recorded']);
  assert.equal([...f.rows.keys()].filter(k=>k.startsWith('delivery_drop_off_audit/')).length,1);
  assert.equal([...f.rows.keys()].filter(k=>k.startsWith('organ_collection_audit/')).length,1);
  assert.equal(f.rows.get(`animal_records/${animalId}`).billingInvoiceId,id);
  const issuedAudit=[...f.rows].find(([k,r])=>k.startsWith('operation_audit/')&&r.action==='invoice_issued')[1];assert.deepEqual(issuedAudit.after.carcassBasis,basis,'audit keeps the carcass-basis provenance');
});
